const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const options = { region: 'southamerica-east1' };
function required(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new HttpsError('invalid-argument', 'Revisá ' + label + '.');
  }
  return value.trim();
}
function validAdult(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const birth = new Date(date + 'T12:00:00Z');
  const now = new Date();
  const limit = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
  return !Number.isNaN(birth.getTime()) && birth.toISOString().slice(0, 10) === date && birth <= limit;
}
function refs(gymId, uid) {
  return {
    gym: db.doc('gyms/' + gymId),
    client: db.doc('gyms/' + gymId + '/clients/' + uid),
    registration: db.doc('gyms/' + gymId + '/requests/' + uid),
    catalog: db.doc('publicCatalog/' + gymId),
  };
}

exports.registerClientProfile = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = required(request.data?.gymId, 'el gimnasio');
  const firstName = required(request.data?.firstName, 'el nombre');
  const lastName = required(request.data?.lastName, 'el apellido');
  const phone = required(request.data?.phone, 'el teléfono', 40);
  const birthDate = request.data?.birthDate;
  const privacyPolicyVersion = required(request.data?.privacyPolicyVersion, 'la versión de privacidad', 80);
  if (firstName.length < 2 || lastName.length < 2 || phone.length < 6 || !validAdult(birthDate)) {
    throw new HttpsError('invalid-argument', 'Completá los datos correctamente. El registro es para mayores de 18 años.');
  }
  const uid = request.auth.uid;
  const r = refs(gymId, uid);
  return db.runTransaction(async tx => {
    const [gym, catalog, client, registration] = await Promise.all([
      tx.get(r.gym), tx.get(r.catalog), tx.get(r.client), tx.get(r.registration),
    ]);
    if (!gym.exists || gym.data().status !== 'active' || !catalog.exists || catalog.data().published !== true) {
      throw new HttpsError('failed-precondition', 'El gimnasio no admite registros en este momento.');
    }
    // La habilitación también se verifica en el servidor, no solo en el navegador.
    if (gym.data().clientRegistrationEnabled !== true ||
        !gym.data().privacyPolicyVersion ||
        gym.data().privacyPolicyVersion !== privacyPolicyVersion) {
      throw new HttpsError('failed-precondition', 'El registro todavía no está habilitado por el gimnasio.');
    }
    if (client.exists || registration.exists) {
      throw new HttpsError('already-exists', 'Ya existe un registro para esta cuenta en el gimnasio.');
    }
    const displayId = 'CL-' + uid.slice(0, 8).toUpperCase();
    tx.create(r.registration, {
      clientUid: uid, firstName, lastName, phone, birthDate,
      email: request.auth.token.email || null, requestedTurnIds: [],
      status: 'registered', privacyPolicyVersion,
      consentedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(r.client, {
      clientUid: uid, displayId, firstName, lastName, phone, birthDate,
      email: request.auth.token.email || null, assignedTurnIds: [],
      status: 'registered', joinedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true, clientId: displayId };
  });
});

exports.enrollClientInTurn = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión para anotarte.');
  const gymId = required(request.data?.gymId, 'el gimnasio');
  const turnId = required(request.data?.turnId, 'el turno');
  if (gymId.includes('/') || turnId.includes('/')) throw new HttpsError('invalid-argument', 'Identificador inválido.');
  const uid = request.auth.uid;
  const r = refs(gymId, uid);
  const enrollment = db.doc('gyms/' + gymId + '/turnEnrollments/' + turnId);
  const member = enrollment.collection('members').doc(uid);
  const assignedQuery = db.collection('gyms/' + gymId + '/clients').where('assignedTurnIds', 'array-contains', turnId);
  return db.runTransaction(async tx => {
    const [gym, registration, client, catalog, enrollmentSnap, memberSnap, assignedSnap] = await Promise.all([
      tx.get(r.gym), tx.get(r.registration), tx.get(r.client), tx.get(r.catalog),
      tx.get(enrollment), tx.get(member), tx.get(assignedQuery),
    ]);
    if (!gym.exists || !registration.exists || !['registered', 'approved'].includes(registration.data().status) ||
        !client.exists || client.data().status === 'inactive') {
      throw new HttpsError('failed-precondition', 'Primero completá el registro en este gimnasio.');
    }
    if (!catalog.exists || catalog.data().published !== true) {
      throw new HttpsError('failed-precondition', 'El catálogo no está publicado.');
    }
    const turn = (gym.data().scheduleTurns || []).find(t => t.id === turnId);
    if (!turn || !(catalog.data().turns || []).some(t => t.id === turnId)) {
      throw new HttpsError('not-found', 'El turno no está publicado.');
    }
    const currentIds = Array.isArray(client.data().assignedTurnIds) ? client.data().assignedTurnIds : [];
    if (memberSnap.exists || currentIds.includes(turnId)) {
      return { success: true, alreadyEnrolled: true, turnId };
    }
    const capacity = Number(turn.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) throw new HttpsError('failed-precondition', 'El cupo del turno es inválido.');
    // El documento del contador serializa las inscripciones concurrentes.
    // Se respeta también a los clientes que ya estaban asignados por el panel.
    const enrolled = Math.max(assignedSnap.size, Number(enrollmentSnap.data()?.enrolled) || 0);
    if (enrolled >= capacity) throw new HttpsError('resource-exhausted', 'Se ocuparon las vacantes. Actualizá los horarios.');
    const next = enrolled + 1;
    tx.create(member, { clientUid: uid, turnId, status: 'active', enrolledAt: FieldValue.serverTimestamp() });
    tx.set(enrollment, { turnId, enrolled: next, capacity, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(r.client, {
      assignedTurnIds: [...new Set([...currentIds, turnId])],
      status: 'active', updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(r.catalog, {
      turns: catalog.data().turns.map(t => t.id === turnId ? { ...t, enrolled: next } : t),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(r.gym, {
      scheduleTurns: (gym.data().scheduleTurns || []).map(t => t.id === turnId ? { ...t, enrolled: next } : t),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true, turnId, enrolled: next, vacancies: capacity - next };
  });
});
