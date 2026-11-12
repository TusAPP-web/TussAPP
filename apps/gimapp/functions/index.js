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
  const gymId = required(request.data?.gymId, 'el gimnasio', 128);
  if (!/^[A-Za-z0-9_-]+$/.test(gymId)) throw new HttpsError('invalid-argument', 'Identificador de gimnasio inválido.');
  const firstName = required(request.data?.firstName, 'el nombre');
  const lastName = required(request.data?.lastName, 'el apellido');
  const phone = required(request.data?.phone, 'el teléfono', 40);
  const birthDate = request.data?.birthDate;
  const privacyPolicyVersion = required(request.data?.privacyPolicyVersion, 'la versión de privacidad', 80);
  if (request.data?.consentAccepted !== true) throw new HttpsError('failed-precondition', 'Tenés que aceptar la información de privacidad.');
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
  const turnId = required(request.data?.turnId, 'el turno', 128);
  if (!/^[A-Za-z0-9_-]+$/.test(gymId) || !/^[A-Za-z0-9_-]+$/.test(turnId)) throw new HttpsError('invalid-argument', 'Identificador inválido.');
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


exports.approveClientRequest = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = required(request.data?.gymId, 'el gimnasio', 128);
  const requestId = required(request.data?.requestId, 'la solicitud', 128);
  if (!/^[A-Za-z0-9_-]+$/.test(gymId) || !/^[A-Za-z0-9_-]+$/.test(requestId)) {
    throw new HttpsError('invalid-argument', 'Identificador inválido.');
  }
  const uid = request.auth.uid;
  const gymRef = db.doc('gyms/' + gymId);
  const teamRef = db.doc('gyms/' + gymId + '/team/' + uid);
  const requestRef = db.doc('gyms/' + gymId + '/requests/' + requestId);
  const catalogRef = db.doc('publicCatalog/' + gymId);
  return db.runTransaction(async tx => {
    const [gymSnap, teamSnap, requestSnap, catalogSnap] = await Promise.all([
      tx.get(gymRef), tx.get(teamRef), tx.get(requestRef), tx.get(catalogRef),
    ]);
    const team = teamSnap.data();
    if (!teamSnap.exists || team.active !== true || !['owner', 'complete'].includes(team.role)) {
      throw new HttpsError('permission-denied', 'Solo el dueño o un administrador activo puede aprobar solicitudes.');
    }
    if (!gymSnap.exists || !requestSnap.exists || requestSnap.data().status !== 'pending') {
      throw new HttpsError('failed-precondition', 'La solicitud ya no está pendiente.');
    }
    if (!catalogSnap.exists) throw new HttpsError('failed-precondition', 'No se encontró el catálogo del gimnasio.');
    const pending = requestSnap.data();
    const clientUid = required(pending.clientUid, 'el cliente', 128);
    const clientRef = db.doc('gyms/' + gymId + '/clients/' + clientUid);
    const clientSnap = await tx.get(clientRef);
    if (clientSnap.exists) throw new HttpsError('already-exists', 'El cliente ya está registrado.');
    const chosen = request.data?.assignedTurnIds;
    const turnIds = [...new Set(Array.isArray(chosen) && chosen.length ? chosen : (pending.requestedTurnIds || []))];
    if (turnIds.length > 20 || turnIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
      throw new HttpsError('invalid-argument', 'La selección de turnos no es válida.');
    }
    const gym = gymSnap.data();
    const catalog = catalogSnap.data();
    const selected = turnIds.map(id => {
      const turn = (gym.scheduleTurns || []).find(item => item.id === id);
      if (!turn || !(catalog.turns || []).some(item => item.id === id)) {
        throw new HttpsError('not-found', 'Uno de los turnos ya no está publicado.');
      }
      const capacity = Number(turn.capacity);
      if (!Number.isInteger(capacity) || capacity < 1) throw new HttpsError('failed-precondition', 'El cupo de un turno no es válido.');
      return { id, capacity };
    });
    const reads = await Promise.all(selected.map(async turn => {
      const counterRef = db.doc('gyms/' + gymId + '/turnEnrollments/' + turn.id);
      const memberRef = counterRef.collection('members').doc(clientUid);
      const assignedQuery = db.collection('gyms/' + gymId + '/clients').where('assignedTurnIds', 'array-contains', turn.id);
      const [counterSnap, memberSnap, assignedSnap] = await Promise.all([
        tx.get(counterRef), tx.get(memberRef), tx.get(assignedQuery),
      ]);
      return { ...turn, counterRef, memberRef, counterSnap, memberSnap, assignedSnap };
    }));
    for (const item of reads) {
      if (item.memberSnap.exists || item.assignedSnap.docs.some(doc => doc.id === clientUid)) {
        throw new HttpsError('already-exists', 'El cliente ya figura en uno de los turnos seleccionados.');
      }
      const enrolled = Math.max(item.assignedSnap.size, Number(item.counterSnap.data()?.enrolled) || 0);
      if (enrolled >= item.capacity) throw new HttpsError('resource-exhausted', 'No quedan vacantes en uno de los turnos seleccionados.');
      item.next = enrolled + 1;
    }
    const displayId = 'CL-' + clientUid.slice(0, 8).toUpperCase();
    tx.set(clientRef, {
      clientUid, displayId, firstName: pending.firstName, lastName: pending.lastName,
      phone: pending.phone, email: pending.email || null,
      assignedTurnIds: turnIds, status: turnIds.length ? 'active' : 'registered',
      joinedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.update(requestRef, {
      status: 'approved', clientId: displayId, reviewedBy: uid,
      reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc('gyms/' + gymId + '/audit/request-approved-' + requestId), {
      type: 'request-approved', requestId, clientUid, actorUid: uid, createdAt: FieldValue.serverTimestamp(),
    });
    for (const item of reads) {
      tx.create(item.memberRef, {
        clientUid, turnId: item.id, status: 'active', enrolledAt: FieldValue.serverTimestamp(),
      });
      tx.set(item.counterRef, {
        turnId: item.id, enrolled: item.next, capacity: item.capacity,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    if (reads.length) {
      const nextById = new Map(reads.map(item => [item.id, item.next]));
      tx.update(catalogRef, {
        turns: (catalog.turns || []).map(turn => nextById.has(turn.id) ? { ...turn, enrolled: nextById.get(turn.id) } : turn),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(gymRef, {
        scheduleTurns: (gym.scheduleTurns || []).map(turn => nextById.has(turn.id) ? { ...turn, enrolled: nextById.get(turn.id) } : turn),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { clientId: displayId, assignedTurnIds: turnIds };
  });
});
