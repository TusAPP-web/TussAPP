const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

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


// Solicitudes de migración de plan. La aprobación no activa el plan:
// queda pendiente la integración del pago confirmado por Mercado Pago.
const planRank = { free: 0, pro: 1, gold: 2 };

exports.requestPlanChange = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = required(request.data?.gymId, 'el gimnasio', 128);
  const requestedPlan = request.data?.requestedPlan;
  if (!/^[A-Za-z0-9_-]+$/.test(gymId) || !['pro', 'gold'].includes(requestedPlan)) {
    throw new HttpsError('invalid-argument', 'La solicitud de plan no es válida.');
  }
  const uid = request.auth.uid;
  const gymRef = db.doc('gyms/' + gymId);
  const ownerRef = db.doc('gyms/' + gymId + '/team/' + uid);
  const controlRef = db.doc('gyms/' + gymId + '/planRequestControl/current');
  const requestRef = db.collection('gyms/' + gymId + '/planRequests').doc();

  return db.runTransaction(async tx => {
    const [gymSnap, ownerSnap, controlSnap] = await Promise.all([
      tx.get(gymRef), tx.get(ownerRef), tx.get(controlRef),
    ]);
    if (!gymSnap.exists || !ownerSnap.exists ||
        gymSnap.data().ownerUid !== uid ||
        ownerSnap.data().uid !== uid ||
        ownerSnap.data().active !== true ||
        ownerSnap.data().role !== 'owner') {
      throw new HttpsError('permission-denied', 'Solo el dueño activo puede solicitar un cambio de plan.');
    }
    const currentPlan = gymSnap.data().plan || 'free';
    if (!(currentPlan in planRank) || planRank[requestedPlan] <= planRank[currentPlan]) {
      throw new HttpsError('failed-precondition', 'El plan solicitado no representa una mejora del plan actual.');
    }
    if (controlSnap.exists &&
        ['pending', 'approved_waiting_payment'].includes(controlSnap.data().status)) {
      throw new HttpsError('already-exists', 'Ya hay una solicitud de cambio de plan pendiente o esperando el pago.');
    }
    tx.create(requestRef, {
      gymId,
      gymName: gymSnap.data().name || '',
      requestedBy: uid,
      requestedPlan,
      currentPlan,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(controlRef, {
      activeRequestId: requestRef.id,
      status: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true, requestId: requestRef.id, status: 'pending' };
  });
});

exports.listPendingPlanChangeRequests = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const adminSnap = await db.doc('platformAdmins/' + request.auth.uid).get();
  if (!adminSnap.exists || adminSnap.data().active !== true) {
    throw new HttpsError('permission-denied', 'No tenés autorización para administrar planes de TusAPP.');
  }
  const snapshot = await db.collectionGroup('planRequests')
    .where('status', '==', 'pending')
    .limit(100)
    .get();
  const items = snapshot.docs.map(item => {
    const gymRef = item.ref.parent.parent;
    const data = item.data();
    return {
      id: item.id,
      gymId: gymRef?.id || '',
      gymName: data.gymName || '',
      currentPlan: data.currentPlan || 'free',
      requestedPlan: data.requestedPlan || '',
      createdAt: data.createdAt?.toDate?.().toISOString() || null,
    };
  });
  items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return { requests: items };
});

// Habilitación manual y gratuita para pruebas, demostraciones o cortesías.
exports.grantPlanManually = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const adminUid = request.auth.uid;
  const adminSnap = await db.doc('platformAdmins/' + adminUid).get();
  if (!adminSnap.exists || adminSnap.data().active !== true) {
    throw new HttpsError('permission-denied', 'No tenés autorización para administrar planes de TusAPP.');
  }
  const gymId = required(request.data?.gymId, 'el identificador del gimnasio', 128);
  const plan = request.data?.plan;
  const reason = required(request.data?.reason, 'el motivo de la habilitación', 500);
  if (!/^[A-Za-z0-9_-]+$/.test(gymId) || !['pro', 'gold'].includes(plan)) {
    throw new HttpsError('invalid-argument', 'El gimnasio o el plan seleccionado no son válidos.');
  }
  let expiresAt = null;
  if (request.data?.expiresAt) {
    const date = new Date(request.data.expiresAt);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new HttpsError('invalid-argument', 'La fecha de vencimiento debe ser futura.');
    }
    if (date.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
      throw new HttpsError('invalid-argument', 'La habilitación temporal no puede superar 366 días.');
    }
    expiresAt = Timestamp.fromDate(date);
  }
  const gymRef = db.doc('gyms/' + gymId);
  const auditRef = db.collection('gyms/' + gymId + '/audit').doc();
  return db.runTransaction(async tx => {
    const gymSnap = await tx.get(gymRef);
    if (!gymSnap.exists) throw new HttpsError('not-found', 'No se encontró el gimnasio indicado.');
    const previousPlan = gymSnap.data().plan || 'free';
    tx.update(gymRef, {
      plan,
      planSource: 'manual',
      planGrantedAt: FieldValue.serverTimestamp(),
      planGrantedBy: adminUid,
      planGrantReason: reason,
      planExpiresAt: expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(auditRef, {
      type: 'manual-plan-granted',
      previousPlan,
      plan,
      grantedBy: adminUid,
      reason,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { success: true, gymId, plan, planSource: 'manual', expiresAt: expiresAt?.toDate().toISOString() || null };
  });
});

// Permite cambiar la fecha de vencimiento de una habilitación manual ya existente.
exports.updateManualPlanExpiry = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const adminUid = request.auth.uid;
  const adminSnap = await db.doc('platformAdmins/' + adminUid).get();
  if (!adminSnap.exists || adminSnap.data().active !== true) {
    throw new HttpsError('permission-denied', 'No tenés autorización para administrar planes de TusAPP.');
  }
  const gymId = required(request.data?.gymId, 'el identificador del gimnasio', 128);
  const reason = required(request.data?.reason, 'el motivo del cambio', 500);
  if (!/^[A-Za-z0-9_-]+$/.test(gymId)) {
    throw new HttpsError('invalid-argument', 'El identificador del gimnasio no es válido.');
  }
  let expiresAt = null;
  if (request.data?.expiresAt !== null && request.data?.expiresAt !== '') {
    if (typeof request.data.expiresAt !== 'string') {
      throw new HttpsError('invalid-argument', 'La fecha de vencimiento no es válida.');
    }
    const date = new Date(request.data.expiresAt);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new HttpsError('invalid-argument', 'La fecha de vencimiento debe ser futura.');
    }
    if (date.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
      throw new HttpsError('invalid-argument', 'La fecha no puede superar 366 días.');
    }
    expiresAt = Timestamp.fromDate(date);
  }
  const gymRef = db.doc('gyms/' + gymId);
  const auditRef = db.collection('gyms/' + gymId + '/audit').doc();
  return db.runTransaction(async tx => {
    const gymSnap = await tx.get(gymRef);
    if (!gymSnap.exists) throw new HttpsError('not-found', 'No se encontró el gimnasio indicado.');
    const gym = gymSnap.data();
    if (gym.planSource !== 'manual' || !['pro', 'gold'].includes(gym.plan)) {
      throw new HttpsError('failed-precondition', 'El gimnasio no tiene una habilitación manual Pro o Gold vigente para modificar.');
    }
    const previousExpiresAt = gym.planExpiresAt || null;
    tx.update(gymRef, {
      planExpiresAt: expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(auditRef, {
      type: 'manual-plan-expiry-updated',
      plan: gym.plan,
      previousExpiresAt,
      expiresAt,
      changedBy: adminUid,
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
    return {
      success: true,
      gymId,
      plan: gym.plan,
      expiresAt: expiresAt?.toDate().toISOString() || null,
    };
  });
});

// Las habilitaciones temporales vencidas vuelven a Gratis automáticamente.
// Una suscripción paga o una nueva habilitación manual nunca se revierte por un vencimiento antiguo.
exports.expireManualPlanGrants = onSchedule({
  schedule: 'every day 03:15',
  timeZone: 'America/Argentina/Buenos_Aires',
  region: 'southamerica-east1',
}, async () => {
  const now = Timestamp.now();
  const expired = await db.collection('gyms')
    .where('planSource', '==', 'manual')
    .where('planExpiresAt', '<=', now)
    .limit(200)
    .get();
  for (const item of expired.docs) {
    await db.runTransaction(async tx => {
      const fresh = await tx.get(item.ref);
      const data = fresh.data();
      if (!fresh.exists || data.planSource !== 'manual' ||
          !data.planExpiresAt || data.planExpiresAt.toMillis() > Date.now()) return;
      tx.update(item.ref, {
        plan: 'free',
        planSource: 'free',
        planExpiresAt: null,
        planGrantedBy: FieldValue.delete(),
        planGrantReason: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(item.ref.collection('audit').doc(), {
        type: 'manual-plan-expired',
        previousPlan: data.plan,
        plan: 'free',
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  }
});

exports.resolvePlanChangeRequest = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = required(request.data?.gymId, 'el gimnasio', 128);
  const requestId = required(request.data?.requestId, 'la solicitud', 128);
  const decision = request.data?.decision;
  if (!/^[A-Za-z0-9_-]+$/.test(gymId) ||
      !/^[A-Za-z0-9_-]+$/.test(requestId) ||
      !['approve', 'reject'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'La resolución de la solicitud no es válida.');
  }
  const uid = request.auth.uid;
  const adminRef = db.doc('platformAdmins/' + uid);
  const gymRef = db.doc('gyms/' + gymId);
  const requestRef = db.doc('gyms/' + gymId + '/planRequests/' + requestId);
  const controlRef = db.doc('gyms/' + gymId + '/planRequestControl/current');
  const auditRef = db.collection('gyms/' + gymId + '/audit').doc('plan-request-' + requestId);

  return db.runTransaction(async tx => {
    const [adminSnap, gymSnap, requestSnap, controlSnap] = await Promise.all([
      tx.get(adminRef), tx.get(gymRef), tx.get(requestRef), tx.get(controlRef),
    ]);
    if (!adminSnap.exists || adminSnap.data().active !== true) {
      throw new HttpsError('permission-denied', 'No tenés autorización para administrar planes de TusAPP.');
    }
    if (!gymSnap.exists || !requestSnap.exists || requestSnap.data().status !== 'pending' ||
        !controlSnap.exists || controlSnap.data().activeRequestId !== requestId) {
      throw new HttpsError('failed-precondition', 'La solicitud no existe o ya fue resuelta.');
    }
    const planRequest = requestSnap.data();
    if (decision === 'approve') {
      const currentPlan = gymSnap.data().plan || 'free';
      if (!(planRequest.requestedPlan in planRank) ||
          planRank[planRequest.requestedPlan] <= planRank[currentPlan]) {
        throw new HttpsError('failed-precondition', 'El plan del gimnasio cambió y esta solicitud quedó desactualizada.');
      }
    }
    const nextStatus = decision === 'approve' ? 'approved_waiting_payment' : 'rejected';
    const note = typeof request.data?.note === 'string' ? request.data.note.trim().slice(0, 500) : '';
    tx.update(requestRef, {
      status: nextStatus,
      reviewedBy: uid,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: note || null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(controlRef, {
      activeRequestId: decision === 'approve' ? requestId : null,
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(auditRef, {
      type: decision === 'approve' ? 'plan-request-approved' : 'plan-request-rejected',
      requestId,
      requestedPlan: planRequest.requestedPlan,
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { success: true, status: nextStatus };
  });
});

// Gestión segura de equipo, invitaciones, cupos y permisos individuales.
Object.assign(exports, require('./team'));
