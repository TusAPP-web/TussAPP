// GimAPP · versión 0.1 · 3 de noviembre de 2026.
// Operaciones del panel que persisten datos del gimnasio autenticado.
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { getFirebaseServices } from '../firebase.js';

function cleanText(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
function gymDoc(db, gymId) { return doc(db, 'gyms', gymId); }

export async function getGymProfile(gymId) {
  const { db } = await getFirebaseServices();
  const snapshot = await getDoc(gymDoc(db, gymId));
  if (!snapshot.exists()) throw new Error('No se encontró el gimnasio de esta cuenta.');
  return { id: snapshot.id, ...snapshot.data() };
}

export async function getPendingRequests(gymId) {
  const { db } = await getFirebaseServices();
  const snapshot = await getDocs(query(
    collection(db, 'gyms', gymId, 'requests'),
    where('status', '==', 'pending'),
    limit(100),
  ));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}

export async function getClients(gymId) {
  const { db } = await getFirebaseServices();
  const snapshot = await getDocs(query(collection(db, 'gyms', gymId, 'clients'), orderBy('lastName', 'asc'), limit(500)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function getCashEntries(gymId) {
  const { db } = await getFirebaseServices();
  const snapshot = await getDocs(query(collection(db, 'gyms', gymId, 'cash'), orderBy('date', 'desc'), limit(1000)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function getCatalogConfiguration(gymId) {
  const { db } = await getFirebaseServices();
  const [gymSnapshot, catalogSnapshot] = await Promise.all([
    getDoc(gymDoc(db, gymId)),
    getDoc(doc(db, 'publicCatalog', gymId)),
  ]);
  const catalog = catalogSnapshot.exists() ? catalogSnapshot.data() : { gymName: '', turns: [], published: false };
  const gym = gymSnapshot.exists() ? gymSnapshot.data() : {};
  return {
    ...catalog,
    turns: Array.isArray(gym.scheduleTurns) ? gym.scheduleTurns : (Array.isArray(catalog.turns) ? catalog.turns : []),
    allowScheduleOverlaps: gym.allowScheduleOverlaps === true,
  };
}

export async function saveGymSchedule({ gymId, turns, allowScheduleOverlaps, gymName, published }) {
  const { db } = await getFirebaseServices();
  const scheduleTurns = (Array.isArray(turns) ? turns : []).map(turn => ({
    id: cleanText(turn.id),
    day: cleanText(turn.day),
    start: cleanText(turn.start),
    end: cleanText(turn.end),
    discipline: cleanText(turn.discipline),
    instructor: cleanText(turn.instructor) || '',
    capacity: Math.max(1, Number(turn.capacity) || 10),
    enrolled: Number(turn.enrolled) || 0,
    waitlist: turn.waitlist !== false,
  }));
  await updateDoc(gymDoc(db, gymId), {
    scheduleTurns,
    allowScheduleOverlaps: Boolean(allowScheduleOverlaps),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'publicCatalog', gymId), {
    gymName: cleanText(gymName),
    turns: scheduleTurns,
    published: Boolean(published),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function updateGymProfile(gymId, values) {
  const { db } = await getFirebaseServices();
  await updateDoc(gymDoc(db, gymId), { ...values, updatedAt: serverTimestamp() });
}

export async function approveRequest({ gymId, requestId, actorUid, assignedTurnIds = [] }) {
  const { db } = await getFirebaseServices();
  const requestRef = doc(db, 'gyms', gymId, 'requests', requestId);
  const requestSnapshot = await getDoc(requestRef);
  if (!requestSnapshot.exists()) throw new Error('La solicitud ya no existe.');
  const request = requestSnapshot.data();
  if (request.status !== 'pending') throw new Error('La solicitud ya fue atendida.');
  const clientRef = doc(db, 'gyms', gymId, 'clients', request.clientUid);
  const displayId = `CL-${request.clientUid.slice(0, 8).toUpperCase()}`;
  const batch = writeBatch(db);
  batch.set(clientRef, {
    clientUid: request.clientUid,
    displayId,
    firstName: request.firstName,
    lastName: request.lastName,
    phone: request.phone,
    email: request.email || null,
    assignedTurnIds: Array.isArray(assignedTurnIds) && assignedTurnIds.length ? assignedTurnIds : request.requestedTurnIds,
    status: 'active',
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.update(requestRef, { status: 'approved', clientId: displayId, reviewedBy: actorUid, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(db, 'gyms', gymId, 'audit', `request-approved-${requestId}`), { type: 'request-approved', requestId, clientUid: request.clientUid, actorUid, createdAt: serverTimestamp() });
  await batch.commit();
  return { clientId: displayId };
}

export async function rejectRequest({ gymId, requestId, actorUid, message = '' }) {
  const { db } = await getFirebaseServices();
  const requestRef = doc(db, 'gyms', gymId, 'requests', requestId);
  await updateDoc(requestRef, { status: 'rejected', rejectionMessage: cleanText(message) || null, reviewedBy: actorUid, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await setDoc(doc(db, 'gyms', gymId, 'audit', `request-rejected-${requestId}`), { type: 'request-rejected', requestId, actorUid, createdAt: serverTimestamp() });
}

export async function saveAttendance({ gymId, trainerUid, clientUid, turnId, date, status }) {
  if (!['present', 'absent'].includes(status)) throw new Error('El estado de asistencia no es válido.');
  const { db } = await getFirebaseServices();
  const id = `${date}_${turnId}_${clientUid}`;
  await setDoc(doc(db, 'gyms', gymId, 'attendance', id), { clientUid, trainerUid, turnId, date, status, updatedAt: serverTimestamp() }, { merge: true });
}

export async function addCashEntry({ gymId, type, amount, category, note, date, actorUid }) {
  if (!['income', 'expense'].includes(type)) throw new Error('El tipo de movimiento no es válido.');
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('Ingresá un importe mayor que cero.');
  const { db } = await getFirebaseServices();
  return addDoc(collection(db, 'gyms', gymId, 'cash'), { type, amount: numericAmount, category: cleanText(category), note: cleanText(note) || null, date, actorUid, createdAt: serverTimestamp() });
}

export async function savePublicCatalog({ gymId, gymName, turns, published }) {
  const { db } = await getFirebaseServices();
  const publicTurns = (Array.isArray(turns) ? turns : []).map(turn => ({
    id: cleanText(turn.id), day: cleanText(turn.day), start: cleanText(turn.start), end: cleanText(turn.end),
    discipline: cleanText(turn.discipline), capacity: Number(turn.capacity) || 0, enrolled: Number(turn.enrolled) || 0,
    waitlist: Boolean(turn.waitlist),
  }));
  await setDoc(doc(db, 'publicCatalog', gymId), { gymName: cleanText(gymName), turns: publicTurns, published: Boolean(published), updatedAt: serverTimestamp() }, { merge: true });
}
