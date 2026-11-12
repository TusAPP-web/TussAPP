const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `Falta ${label}.`);
  }
  return value.trim();
}

exports.enrollClientInTurn = onCall({ region: 'southamerica-east1', enforceAppCheck: false }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión para anotarte.');
  const gymId = requiredString(request.data?.gymId, 'el gimnasio');
  const turnId = requiredString(request.data?.turnId, 'el turno');
  const uid = request.auth.uid;

  const gymRef = db.doc(`gyms/${gymId}`);
  const requestRef = db.doc(`gyms/${gymId}/requests/${uid}`);
  const clientRef = db.doc(`gyms/${gymId}/clients/${uid}`);
  const enrollmentRef = db.doc(`gyms/${gymId}/turnEnrollments/${turnId}`);
  const memberRef = enrollmentRef.collection('members').doc(uid);
  const publicCatalogRef = db.doc(`publicCatalog/${gymId}`);

  return db.runTransaction(async (tx) => {
    const [gymSnap, registrationSnap, clientSnap, enrollmentSnap, memberSnap, catalogSnap] = await Promise.all([
      tx.get(gymRef), tx.get(requestRef), tx.get(clientRef), tx.get(enrollmentRef), tx.get(memberRef), tx.get(publicCatalogRef),
    ]);

    if (!gymSnap.exists) throw new HttpsError('not-found', 'No se encontró el gimnasio.');
    if (!registrationSnap.exists || registrationSnap.data().status !== 'registered') {
      throw new HttpsError('failed-precondition', 'Primero tenés que completar tu registro.');
    }
    if (!clientSnap.exists || clientSnap.data().status === 'inactive') {
      throw new HttpsError('failed-precondition', 'La cuenta no está habilitada para anotarse.');
    }
    if (!catalogSnap.exists || catalogSnap.data().published !== true) {
      throw new HttpsError('failed-precondition', 'El gimnasio no tiene el catálogo publicado.');
    }

    const schedule = Array.isArray(gymSnap.data().scheduleTurns) ? gymSnap.data().scheduleTurns : [];
    const turn = schedule.find(item => item.id === turnId);
    if (!turn) throw new HttpsError('not-found', 'Ese turno ya no está publicado.');

    if (memberSnap.exists) throw new HttpsError('already-exists', 'Ya estás anotado en este turno.');

    const capacity = Math.max(0, Number(turn.capacity) || 0);
    const enrolled = Math.max(0, Number(enrollmentSnap.exists ? enrollmentSnap.data().enrolled : 0) || 0);
    if (capacity <= enrolled) throw new HttpsError('resource-exhausted', 'Se ocuparon las vacantes de este turno. Actualizá los horarios.');

    const currentClient = clientSnap.data();
    const assignedTurnIds = Array.isArray(currentClient.assignedTurnIds) ? currentClient.assignedTurnIds : [];
    const nextAssigned = [...new Set([...assignedTurnIds, turnId])];

    tx.create(memberRef, { clientUid: uid, turnId, enrolledAt: FieldValue.serverTimestamp(), status: 'active' });
    tx.set(enrollmentRef, {
      turnId,
      enrolled: enrolled + 1,
      capacity,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(clientRef, {
      clientUid: uid,
      assignedTurnIds: nextAssigned,
      status: 'active',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const publicTurns = Array.isArray(catalogSnap.data().turns) ? catalogSnap.data().turns : [];
    tx.update(publicCatalogRef, {
      turns: publicTurns.map(item => item.id === turnId ? { ...item, enrolled: enrolled + 1 } : item),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, turnId, enrolled: enrolled + 1, vacancies: capacity - enrolled - 1 };
  });
});
