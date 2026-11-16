const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

const db = getFirestore();
const options = { region: 'southamerica-east1' };
const permissionKeys = [
  'viewSchedule', 'viewClients', 'viewRequests', 'approveRequests',
  'takeAttendance', 'manageSchedule', 'manageClients', 'manageCash',
  'viewReports', 'manageCatalog',
];
function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new HttpsError('invalid-argument', 'Revisá ' + label + '.');
  }
  return value.trim();
}
function validId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function cleanPermissions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'Configurá los permisos del empleado.');
  }
  const result = {};
  for (const key of permissionKeys) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Hay un permiso con un valor inválido.');
    }
    result[key] = value[key] === true;
  }
  if (Object.keys(value).some(key => !permissionKeys.includes(key))) {
    throw new HttpsError('invalid-argument', 'Se recibió un permiso desconocido.');
  }
  return result;
}
async function ownerContext(tx, gymId, uid) {
  const gymRef = db.doc('gyms/' + gymId);
  const ownerRef = gymRef.collection('team').doc(uid);
  const [gymSnap, ownerSnap] = await Promise.all([tx.get(gymRef), tx.get(ownerRef)]);
  if (!gymSnap.exists || gymSnap.data().ownerUid !== uid ||
      !ownerSnap.exists || ownerSnap.data().uid !== uid ||
      ownerSnap.data().active !== true || ownerSnap.data().role !== 'owner') {
    throw new HttpsError('permission-denied', 'Solo el dueño activo puede administrar el equipo.');
  }
  return { gymRef, gym: gymSnap.data(), ownerRef };
}
function planIsActive(gym) {
  if (!['pro', 'gold'].includes(gym.plan || 'free')) return false;
  const expiry = gym.planExpiresAt;
  return !expiry || expiry.toMillis() > Date.now();
}
async function countReservedSeats(tx, gymRef) {
  const [members, invitations] = await Promise.all([
    tx.get(gymRef.collection('team').where('active', '==', true)),
    tx.get(gymRef.collection('teamInvitations').where('status', '==', 'pending')),
  ]);
  const now = Date.now();
  const pending = invitations.docs.filter(item => item.data().expiresAt?.toMillis?.() > now);
  return members.size + pending.length;
}
function validatePlanPermissions(gym, permissions) {
  if (gym.plan === 'pro') {
    const proKeys = ['viewSchedule', 'viewClients', 'viewRequests', 'takeAttendance', 'manageCash', 'viewReports'];
    if (Object.keys(permissions).some(key => permissions[key] && !proKeys.includes(key))) {
      throw new HttpsError('failed-precondition', 'Los permisos avanzados están disponibles en Gold.');
    }
  }
  return permissions;
}
function validateTurns(gym, turnIds) {
  if (!Array.isArray(turnIds) || turnIds.length > 100 ||
      turnIds.some(id => !validId(id))) {
    throw new HttpsError('invalid-argument', 'La asignación de horarios no es válida.');
  }
  const available = new Set((gym.scheduleTurns || []).map(turn => turn.id));
  if (turnIds.some(id => !available.has(id))) {
    throw new HttpsError('not-found', 'Uno de los horarios seleccionados ya no existe.');
  }
  return [...new Set(turnIds)];
}


function memberHasPermission(member, gym, permission) {
  if (member.role === 'owner') return true;
  if (!member.permissions && member.role === 'complete') return true;
  const goldOnly = ['approveRequests', 'manageSchedule', 'manageClients', 'manageCatalog'];
  if (goldOnly.includes(permission) && !(gym.plan === 'gold' &&
      (!gym.planExpiresAt || gym.planExpiresAt.toMillis() > Date.now()))) return false;
  if (member.permissions) return member.permissions[permission] === true;
  if (member.role === 'intermediate') {
    return ['viewSchedule', 'viewClients', 'viewRequests', 'takeAttendance'].includes(permission);
  }
  return member.role === 'basic' && permission === 'viewSchedule';
}

exports.getGymWorkspace = onCall(options, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = text(request.data?.gymId, 'el gimnasio', 128);
  if (!validId(gymId)) throw new HttpsError('invalid-argument', 'El identificador del gimnasio no es válido.');
  const uid = request.auth.uid;
  const [gymSnap, memberSnap, catalogSnap] = await Promise.all([
    db.doc('gyms/' + gymId).get(),
    db.doc('gyms/' + gymId + '/team/' + uid).get(),
    db.doc('publicCatalog/' + gymId).get(),
  ]);
  if (!gymSnap.exists || gymSnap.data().status !== 'active' || !memberSnap.exists || memberSnap.data().uid !== uid || memberSnap.data().active !== true) {
    throw new HttpsError('permission-denied', 'No tenés acceso activo a este gimnasio.');
  }
  const gym = gymSnap.data();
  const member = memberSnap.data();
  const catalog = catalogSnap.exists ? catalogSnap.data() : {};
  const canViewSchedule = ['viewSchedule', 'takeAttendance', 'manageSchedule', 'manageCatalog']
    .some(permission => memberHasPermission(member, gym, permission));
  const canManageAllTurns = member.role === 'owner' ||
    (!member.permissions && ['complete', 'intermediate', 'basic'].includes(member.role)) ||
    memberHasPermission(member, gym, 'manageSchedule') ||
    memberHasPermission(member, gym, 'manageCatalog');
  const allTurns = Array.isArray(gym.scheduleTurns) ? gym.scheduleTurns
    : (Array.isArray(catalog.turns) ? catalog.turns : []);
  const assigned = Array.isArray(member.assignedTurnIds) ? member.assignedTurnIds : [];
  const visibleTurns = !canViewSchedule ? []
    : canManageAllTurns ? allTurns
    : allTurns.filter(turn => assigned.includes(turn.id));
  const planExpiresAt = gym.planExpiresAt?.toDate?.().toISOString() || null;
  return {
    gym: {
      id: gymId,
      name: gym.name || '',
      plan: gym.plan || 'free',
      planSource: gym.planSource || 'free',
      planGrantReason: gym.planGrantReason || '',
      planExpiresAt,
      absenceNoticeHours: Number(gym.absenceNoticeHours || 12),
      allowScheduleOverlaps: gym.allowScheduleOverlaps === true,
    },
    catalog: {
      gymName: catalog.gymName || gym.name || '',
      turns: visibleTurns,
      published: catalog.published === true,
      allowScheduleOverlaps: gym.allowScheduleOverlaps === true,
    },
  };
});

exports.createTeamInvitation = onCall(options, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = text(request.data?.gymId, 'el gimnasio', 128);
  if (!validId(gymId)) throw new HttpsError('invalid-argument', 'El identificador del gimnasio no es válido.');
  const email = text(request.data?.email, 'el correo electrónico', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'El correo electrónico no es válido.');
  }
  const name = text(request.data?.name, 'el nombre del empleado');
  const permissions = cleanPermissions(request.data?.permissions);
  const uid = request.auth.uid;
  const gymRef = db.doc('gyms/' + gymId);
  const invitationRef = gymRef.collection('teamInvitations').doc();
  const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return db.runTransaction(async tx => {
    const { gym } = await ownerContext(tx, gymId, uid);
    if (gym.status !== 'active') throw new HttpsError('failed-precondition', 'El gimnasio no está activo.');
    if (!planIsActive(gym)) {
      throw new HttpsError('failed-precondition', 'La gestión de empleados requiere un plan Pro o Gold activo.');
    }
    validatePlanPermissions(gym, permissions);
    const turnIds = validateTurns(gym, request.data?.assignedTurnIds || []);
    const [seats, duplicate, existingMembers] = await Promise.all([
      countReservedSeats(tx, gymRef),
      tx.get(gymRef.collection('teamInvitations').where('email', '==', email)),
      tx.get(gymRef.collection('team').where('email', '==', email)),
    ]);
    if (existingMembers.docs.some(item => item.data().active === true)) {
      throw new HttpsError('already-exists', 'Ese correo ya pertenece a un empleado activo del gimnasio.');
    }
    if (duplicate.docs.some(item => item.data().status === 'pending' && item.data().expiresAt?.toMillis?.() > Date.now())) {
      throw new HttpsError('already-exists', 'Ya hay una invitación pendiente para ese correo.');
    }
    if (gym.plan === 'pro' && seats >= 3) {
      throw new HttpsError('resource-exhausted', 'El plan Pro permite hasta 3 cuentas en total, incluido el dueño. Revocá una invitación o cambiá a Gold.');
    }
    tx.create(invitationRef, {
      email, name, role: 'staff', permissions, assignedTurnIds: turnIds,
      status: 'pending', createdBy: uid,
      createdAt: FieldValue.serverTimestamp(), expiresAt,
    });
    return { success: true, invitationId: invitationRef.id, email, expiresAt: expiresAt.toDate().toISOString() };
  });
});

exports.acceptTeamInvitation = onCall(options, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión para aceptar la invitación.');
  const gymId = text(request.data?.gymId, 'el gimnasio', 128);
  const invitationId = text(request.data?.invitationId, 'la invitación', 128);
  if (!validId(gymId) || !validId(invitationId)) throw new HttpsError('invalid-argument', 'La invitación no es válida.');
  const email = String(request.auth.token.email || '').trim().toLowerCase();
  if (!email || request.auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Verificá tu correo electrónico antes de aceptar la invitación.');
  }
  const uid = request.auth.uid;
  const gymRef = db.doc('gyms/' + gymId);
  const inviteRef = gymRef.collection('teamInvitations').doc(invitationId);
  const memberRef = gymRef.collection('team').doc(uid);
  const userRef = db.doc('users/' + uid);
  return db.runTransaction(async tx => {
    const [gymSnap, inviteSnap, memberSnap, userSnap] = await Promise.all([
      tx.get(gymRef), tx.get(inviteRef), tx.get(memberRef), tx.get(userRef),
    ]);
    if (!gymSnap.exists || gymSnap.data().status !== 'active' || !inviteSnap.exists) {
      throw new HttpsError('not-found', 'No se encontró la invitación.');
    }
    const gym = gymSnap.data();
    const invite = inviteSnap.data();
    if (invite.status !== 'pending' || !invite.expiresAt || invite.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('failed-precondition', 'La invitación venció o ya fue utilizada.');
    }
    if (invite.email !== email) {
      throw new HttpsError('permission-denied', 'La invitación fue enviada a otro correo electrónico.');
    }
    if (!planIsActive(gym)) {
      throw new HttpsError('failed-precondition', 'El plan Pro o Gold del gimnasio no está activo.');
    }
    validatePlanPermissions(gym, invite.permissions || {});
    if (memberSnap.exists && memberSnap.data().active === true) {
      throw new HttpsError('already-exists', 'Esta cuenta ya forma parte del equipo.');
    }
    if (userSnap.exists && userSnap.data().accountType !== 'staff') {
      throw new HttpsError('failed-precondition', 'Esta cuenta ya está vinculada a otro tipo de perfil. Usá una cuenta separada para el equipo.');
    }
    if (userSnap.exists && userSnap.data().currentGymId && userSnap.data().currentGymId !== gymId) {
      throw new HttpsError('failed-precondition', 'Esta cuenta ya está vinculada a otro gimnasio.');
    }
    const seats = await countReservedSeats(tx, gymRef);
    if (gym.plan === 'pro' && seats > 3) {
      throw new HttpsError('resource-exhausted', 'Se alcanzó el máximo de 3 cuentas del plan Pro.');
    }
    const assignedTurnIds = validateTurns(gym, invite.assignedTurnIds || []);
    tx.set(memberRef, {
      uid, name: invite.name, email, role: 'staff', active: true,
      permissions: invite.permissions, assignedTurnIds,
      invitedBy: invite.createdBy, joinedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(userRef, {
      accountType: 'staff', currentGymId: gymId,
      createdAt: userSnap.exists ? (userSnap.data().createdAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.update(inviteRef, {
      status: 'accepted', acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp(),
    });
    tx.create(gymRef.collection('audit').doc(), {
      type: 'team-invitation-accepted', memberUid: uid, invitationId,
      actorUid: uid, createdAt: FieldValue.serverTimestamp(),
    });
    return { success: true, gymId, role: 'staff' };
  });
});

exports.updateTeamMember = onCall(options, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = text(request.data?.gymId, 'el gimnasio', 128);
  const memberUid = text(request.data?.memberUid, 'el empleado', 128);
  if (!validId(gymId) || !validId(memberUid) || memberUid === request.auth.uid) {
    throw new HttpsError('invalid-argument', 'El empleado indicado no es válido.');
  }
  const permissions = cleanPermissions(request.data?.permissions);
  const gymRef = db.doc('gyms/' + gymId);
  const memberRef = gymRef.collection('team').doc(memberUid);
  return db.runTransaction(async tx => {
    const { gym } = await ownerContext(tx, gymId, request.auth.uid);
    if (gym.status !== 'active') throw new HttpsError('failed-precondition', 'El gimnasio no está activo.');
    if (!planIsActive(gym)) throw new HttpsError('failed-precondition', 'La gestión del equipo requiere Pro o Gold activo.');
    validatePlanPermissions(gym, permissions);
    const assignedTurnIds = validateTurns(gym, request.data?.assignedTurnIds || []);
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists || memberSnap.data().role === 'owner' || memberSnap.data().active !== true) {
      throw new HttpsError('not-found', 'No se encontró un empleado activo para modificar.');
    }
    tx.update(memberRef, { permissions, assignedTurnIds, updatedAt: FieldValue.serverTimestamp() });
    tx.create(gymRef.collection('audit').doc(), {
      type: 'team-member-permissions-updated', memberUid,
      actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    });
    return { success: true, memberUid, permissions, assignedTurnIds };
  });
});

exports.revokeTeamInvitation = onCall(options, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = text(request.data?.gymId, 'el gimnasio', 128);
  const invitationId = text(request.data?.invitationId, 'la invitación', 128);
  if (!validId(gymId) || !validId(invitationId)) throw new HttpsError('invalid-argument', 'La invitación no es válida.');
  const gymRef = db.doc('gyms/' + gymId);
  const inviteRef = gymRef.collection('teamInvitations').doc(invitationId);
  return db.runTransaction(async tx => {
    await ownerContext(tx, gymId, request.auth.uid);
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists || inviteSnap.data().status !== 'pending') {
      throw new HttpsError('not-found', 'No hay una invitación pendiente con ese identificador.');
    }
    tx.update(inviteRef, { status: 'revoked', revokedBy: request.auth.uid, revokedAt: FieldValue.serverTimestamp() });
    return { success: true };
  });
});

exports.deactivateTeamMember = onCall(options, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = text(request.data?.gymId, 'el gimnasio', 128);
  const memberUid = text(request.data?.memberUid, 'el empleado', 128);
  if (!validId(gymId) || !validId(memberUid) || memberUid === request.auth.uid) {
    throw new HttpsError('invalid-argument', 'No podés desactivar esa cuenta.');
  }
  const gymRef = db.doc('gyms/' + gymId);
  const memberRef = gymRef.collection('team').doc(memberUid);
  return db.runTransaction(async tx => {
    await ownerContext(tx, gymId, request.auth.uid);
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists || memberSnap.data().role === 'owner' || memberSnap.data().active !== true) {
      throw new HttpsError('not-found', 'No se encontró un empleado activo.');
    }
    tx.update(memberRef, { active: false, permissions: {}, assignedTurnIds: [], deactivatedAt: FieldValue.serverTimestamp() });
    tx.create(gymRef.collection('audit').doc(), {
      type: 'team-member-deactivated', memberUid,
      actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    });
    return { success: true };
  });
});

exports.listTeam = onCall(options, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const gymId = text(request.data?.gymId, 'el gimnasio', 128);
  if (!validId(gymId)) throw new HttpsError('invalid-argument', 'El identificador del gimnasio no es válido.');
  const gymRef = db.doc('gyms/' + gymId);
  return db.runTransaction(async tx => {
    const { gym } = await ownerContext(tx, gymId, request.auth.uid);
    const [members, invitations] = await Promise.all([
      tx.get(gymRef.collection('team').orderBy('createdAt', 'asc')),
      tx.get(gymRef.collection('teamInvitations').where('status', '==', 'pending')),
    ]);
    return {
      plan: gym.plan || 'free',
      members: members.docs.map(item => {
        const data = item.data();
        return {
          uid: item.id, name: data.name || '', email: data.email || '',
          role: data.role || '', active: data.active === true,
          permissions: data.permissions || {},
          assignedTurnIds: Array.isArray(data.assignedTurnIds) ? data.assignedTurnIds : [],
          createdAt: data.createdAt?.toDate?.().toISOString() || null,
        };
      }),
      invitations: invitations.docs.filter(item => item.data().expiresAt?.toMillis?.() > Date.now())
        .map(item => ({
          id: item.id, email: item.data().email || '',
          expiresAt: item.data().expiresAt.toDate().toISOString(),
        })),
    };
  });
});
