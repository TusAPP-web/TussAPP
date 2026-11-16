const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const projectId = 'demo-gimapp';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const functionsHost = '127.0.0.1:5001';
const region = 'southamerica-east1';
const app = initializeApp({ projectId }, 'gimapp-emulator-tests');
const db = getFirestore(app);
const base = 'http://' + functionsHost + '/' + projectId + '/' + region;

async function authUser(email) {
  const response = await fetch('http://' + authHost + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPassword123!', returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}
async function verifyEmail(user) {
  await getAuth(app).updateUser(user.localId, { emailVerified: true });
  const signInResponse = await fetch('http://' + authHost + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: 'TestPassword123!', returnSecureToken: true }),
  });
  const signedIn = await signInResponse.json();
  assert.equal(signInResponse.ok, true, JSON.stringify(signedIn));
  const claims = JSON.parse(Buffer.from(signedIn.idToken.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.email_verified, true, JSON.stringify(claims));
  return signedIn;
}
async function call(name, token, data) {
  const response = await fetch(base + '/' + name, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}
async function seedGym(gymId, enabled = true) {
  await db.doc('gyms/' + gymId).set({
    status: 'active', clientRegistrationEnabled: enabled,
    privacyPolicyVersion: 'test-v1',
    scheduleTurns: [{ id: 'turn-1', capacity: 1, enrolled: 0 }],
  });
  await db.doc('publicCatalog/' + gymId).set({
    published: true, turns: [{ id: 'turn-1', capacity: 1, enrolled: 0 }],
  });
}
async function register(uidToken, gymId) {
  return call('registerClientProfile', uidToken, {
    gymId, firstName: 'Cliente', lastName: 'Prueba', phone: '3755123456',
    birthDate: '1990-01-01', privacyPolicyVersion: 'test-v1', consentAccepted: true,
  });
}

(async () => {
  try {
    await seedGym('gym-test');
    await seedGym('gym-disabled', false);
    await seedGym('gym-legacy', true);

    const userA = await authUser('a@example.test');
    const userB = await authUser('b@example.test');

    const [regA, regB] = await Promise.all([
      register(userA.idToken, 'gym-test'),
      register(userB.idToken, 'gym-test'),
    ]);
    assert.equal(regA.status, 200, JSON.stringify(regA.body));
    assert.equal(regB.status, 200, JSON.stringify(regB.body));

    const [enrollA, enrollB] = await Promise.all([
      call('enrollClientInTurn', userA.idToken, { gymId: 'gym-test', turnId: 'turn-1' }),
      call('enrollClientInTurn', userB.idToken, { gymId: 'gym-test', turnId: 'turn-1' }),
    ]);
    const outcomes = [enrollA, enrollB];
    assert.equal(outcomes.filter(x => x.status === 200 && x.body.result?.success).length, 1,
      JSON.stringify(outcomes));
    assert.equal(outcomes.filter(x => x.body.error?.status === 'RESOURCE_EXHAUSTED').length, 1,
      JSON.stringify(outcomes));

    const winner = enrollA.status === 200 ? userA : userB;
    const repeated = await call('enrollClientInTurn', winner.idToken, { gymId: 'gym-test', turnId: 'turn-1' });
    assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
    assert.equal(repeated.body.result?.alreadyEnrolled, true, JSON.stringify(repeated.body));

    const counter = await db.doc('gyms/gym-test/turnEnrollments/turn-1').get();
    assert.equal(counter.data()?.enrolled, 1);
    const memberships = await db.collection('gyms/gym-test/turnEnrollments/turn-1/members').get();
    assert.equal(memberships.size, 1);
    const assigned = await db.collection('gyms/gym-test/clients').where('assignedTurnIds', 'array-contains', 'turn-1').get();
    assert.equal(assigned.size, 1);

    const legacyClient = await authUser('legacy-client@example.test');
    const owner = await authUser('owner@example.test');
    await db.doc('gyms/gym-legacy/team/' + owner.localId).set({
      uid: owner.localId, role: 'owner', active: true,
    });
    await db.doc('gyms/gym-legacy/requests/' + legacyClient.localId).set({
      clientUid: legacyClient.localId, firstName: 'Legado', lastName: 'Prueba',
      phone: '3755123456', email: 'legacy-client@example.test',
      requestedTurnIds: ['turn-1'], status: 'pending',
    });
    const forbiddenApproval = await call('approveClientRequest', userA.idToken, {
      gymId: 'gym-legacy', requestId: legacyClient.localId,
    });
    assert.equal(forbiddenApproval.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(forbiddenApproval.body));
    const approval = await call('approveClientRequest', owner.idToken, {
      gymId: 'gym-legacy', requestId: legacyClient.localId,
    });
    assert.equal(approval.status, 200, JSON.stringify(approval.body));
    assert.deepEqual(approval.body.result?.assignedTurnIds, ['turn-1']);
    const legacyCounter = await db.doc('gyms/gym-legacy/turnEnrollments/turn-1').get();
    assert.equal(legacyCounter.data()?.enrolled, 1);
    const legacyMembership = await db.doc('gyms/gym-legacy/turnEnrollments/turn-1/members/' + legacyClient.localId).get();
    assert.equal(legacyMembership.exists, true);
    const legacyRequest = await db.doc('gyms/gym-legacy/requests/' + legacyClient.localId).get();
    assert.equal(legacyRequest.data()?.status, 'approved');

    const disabledUser = await authUser('disabled@example.test');
    const disabled = await register(disabledUser.idToken, 'gym-disabled');
    assert.equal(disabled.body.error?.status, 'FAILED_PRECONDITION', JSON.stringify(disabled.body));

    const planOwner = await authUser('plan-owner@example.test');
    await db.doc('gyms/gym-plan/team/' + planOwner.localId).set({
      uid: planOwner.localId, role: 'owner', active: true,
    });
    await db.doc('gyms/gym-plan').set({
      ownerUid: planOwner.localId, name: 'Plan test', status: 'active', plan: 'free',
    });
    const planRequest = await call('requestPlanChange', planOwner.idToken, {
      gymId: 'gym-plan', requestedPlan: 'pro',
    });
    assert.equal(planRequest.status, 200, JSON.stringify(planRequest.body));
    assert.equal(planRequest.body.result?.status, 'pending');
    const duplicatePlanRequest = await call('requestPlanChange', planOwner.idToken, {
      gymId: 'gym-plan', requestedPlan: 'gold',
    });
    assert.equal(duplicatePlanRequest.body.error?.status, 'ALREADY_EXISTS', JSON.stringify(duplicatePlanRequest.body));
    const unauthorizedAdminQueue = await call('listPendingPlanChangeRequests', userA.idToken, {});
    assert.equal(unauthorizedAdminQueue.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(unauthorizedAdminQueue.body));
    const unauthorizedPlanReview = await call('resolvePlanChangeRequest', userA.idToken, {
      gymId: 'gym-plan', requestId: planRequest.body.result.requestId, decision: 'approve',
    });
    assert.equal(unauthorizedPlanReview.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(unauthorizedPlanReview.body));
    const platformAdmin = await authUser('platform-admin@example.test');
    await db.doc('platformAdmins/' + platformAdmin.localId).set({ active: true });
    await db.doc('gyms/gym-trial').set({
      ownerUid: planOwner.localId, name: 'Gimnasio de prueba', status: 'active', plan: 'free',
    });
    const unauthorizedGrant = await call('grantPlanManually', userA.idToken, {
      gymId: 'gym-trial', plan: 'gold', reason: 'Prueba',
    });
    assert.equal(unauthorizedGrant.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(unauthorizedGrant.body));
    await db.doc('gyms/gym-trial-overcap').set({
      ownerUid: planOwner.localId, name: 'Gimnasio con exceso de cuentas', status: 'active', plan: 'free',
    });
    await db.doc('gyms/gym-trial-overcap/team/' + planOwner.localId).set({
      uid: planOwner.localId, role: 'owner', active: true,
    });
    for (let i = 1; i <= 3; i++) {
      await db.doc('gyms/gym-trial-overcap/team/legacy-staff-' + i).set({
        uid: 'legacy-staff-' + i, role: 'staff', active: true,
      });
    }
    const overCapGrant = await call('grantPlanManually', platformAdmin.idToken, {
      gymId: 'gym-trial-overcap', plan: 'pro', reason: 'Prueba de límite de cuentas',
    });
    assert.equal(overCapGrant.body.error?.status, 'FAILED_PRECONDITION', JSON.stringify(overCapGrant.body));
    const trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const manualGrant = await call('grantPlanManually', platformAdmin.idToken, {
      gymId: 'gym-trial', plan: 'pro', reason: 'Prueba piloto autorizada', expiresAt: trialExpiry,
    });
    assert.equal(manualGrant.status, 200, JSON.stringify(manualGrant.body));
    assert.equal(manualGrant.body.result?.planSource, 'manual');
    const trialGym = await db.doc('gyms/gym-trial').get();
    assert.equal(trialGym.data()?.plan, 'pro');
    assert.equal(trialGym.data()?.planSource, 'manual');
    assert.equal(trialGym.data()?.planGrantReason, 'Prueba piloto autorizada');
    assert.equal(trialGym.data()?.planGrantedBy, platformAdmin.localId);
    assert.ok(trialGym.data()?.planExpiresAt?.toMillis() > Date.now());
    const makeTrialPermanent = await call('updateManualPlanExpiry', platformAdmin.idToken, {
      gymId: 'gym-trial', expiresAt: null, reason: 'Extensión indefinida para tester',
    });
    assert.equal(makeTrialPermanent.status, 200, JSON.stringify(makeTrialPermanent.body));
    assert.equal(makeTrialPermanent.body.result?.expiresAt, null);
    const permanentTrial = await db.doc('gyms/gym-trial').get();
    assert.equal(permanentTrial.data()?.planSource, 'manual');
    assert.equal(permanentTrial.data()?.planExpiresAt, null);
    const setTrialExpiry = await call('updateManualPlanExpiry', platformAdmin.idToken, {
      gymId: 'gym-trial',
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      reason: 'Se establece nueva fecha de finalización',
    });
    assert.equal(setTrialExpiry.status, 200, JSON.stringify(setTrialExpiry.body));
    assert.ok((await db.doc('gyms/gym-trial').get()).data()?.planExpiresAt?.toMillis() > Date.now());
    const unauthorizedExpiryEdit = await call('updateManualPlanExpiry', userA.idToken, {
      gymId: 'gym-trial', expiresAt: null, reason: 'No autorizado',
    });
    assert.equal(unauthorizedExpiryEdit.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(unauthorizedExpiryEdit.body));

    const adminQueue = await call('listPendingPlanChangeRequests', platformAdmin.idToken, {});
    assert.equal(adminQueue.status, 200, JSON.stringify(adminQueue.body));
    assert.equal(adminQueue.body.result?.requests?.length, 1, JSON.stringify(adminQueue.body));
    const approvedPlan = await call('resolvePlanChangeRequest', platformAdmin.idToken, {
      gymId: 'gym-plan', requestId: planRequest.body.result.requestId, decision: 'approve',
    });
    assert.equal(approvedPlan.status, 200, JSON.stringify(approvedPlan.body));
    assert.equal(approvedPlan.body.result?.status, 'approved_waiting_payment');
    const planAfterApproval = await db.doc('gyms/gym-plan').get();
    assert.equal(planAfterApproval.data()?.plan, 'free');
    const requestWhileWaitingPayment = await call('requestPlanChange', planOwner.idToken, {
      gymId: 'gym-plan', requestedPlan: 'gold',
    });
    assert.equal(requestWhileWaitingPayment.body.error?.status, 'ALREADY_EXISTS', JSON.stringify(requestWhileWaitingPayment.body));


    // Invitaciones, cupos Pro, permisos por empleado y usuarios ilimitados Gold.
    const teamOwner = await authUser('team-owner@example.test');
    await db.doc('gyms/gym-team-pro').set({
      ownerUid: teamOwner.localId, name: 'Gimnasio Pro Equipo',
      status: 'active', plan: 'pro',
      scheduleTurns: [
        { id: 'turn-morning', day: 'Lunes', start: '08:00', end: '09:00', discipline: 'Funcional' },
        { id: 'turn-evening', day: 'Lunes', start: '19:00', end: '20:00', discipline: 'Yoga' },
      ],
    });
    await db.doc('gyms/gym-team-pro/team/' + teamOwner.localId).set({
      uid: teamOwner.localId, name: 'Dueño', email: 'team-owner@example.test',
      role: 'owner', active: true, createdAt: FieldValue.serverTimestamp(),
    });
    const basicEmployeePermissions = {
      viewSchedule: true, viewClients: true, viewRequests: true, takeAttendance: true,
    };
    const inviteOne = await call('createTeamInvitation', teamOwner.idToken, {
      gymId: 'gym-team-pro', name: 'Empleado Uno', email: 'employee-one@example.test',
      permissions: basicEmployeePermissions, assignedTurnIds: ['turn-morning'],
    });
    assert.equal(inviteOne.status, 200, JSON.stringify(inviteOne.body));
    const duplicateEmployeeInvite = await call('createTeamInvitation', teamOwner.idToken, {
      gymId: 'gym-team-pro', name: 'Empleado Uno duplicado', email: 'employee-one@example.test',
      permissions: basicEmployeePermissions, assignedTurnIds: ['turn-morning'],
    });
    assert.equal(duplicateEmployeeInvite.body.error?.status, 'ALREADY_EXISTS', JSON.stringify(duplicateEmployeeInvite.body));
    const inviteTwo = await call('createTeamInvitation', teamOwner.idToken, {
      gymId: 'gym-team-pro', name: 'Empleado Dos', email: 'employee-two@example.test',
      permissions: basicEmployeePermissions, assignedTurnIds: ['turn-morning'],
    });
    assert.equal(inviteTwo.status, 200, JSON.stringify(inviteTwo.body));
    const inviteThree = await call('createTeamInvitation', teamOwner.idToken, {
      gymId: 'gym-team-pro', name: 'Empleado Tres', email: 'employee-three@example.test',
      permissions: basicEmployeePermissions, assignedTurnIds: ['turn-morning'],
    });
    assert.equal(inviteThree.body.error?.status, 'RESOURCE_EXHAUSTED', JSON.stringify(inviteThree.body));
    const goldPermissionOnPro = await call('createTeamInvitation', teamOwner.idToken, {
      gymId: 'gym-team-pro', name: 'Empleado Gold', email: 'employee-gold@example.test',
      permissions: { ...basicEmployeePermissions, manageSchedule: true },
      assignedTurnIds: ['turn-morning'],
    });
    assert.equal(goldPermissionOnPro.body.error?.status, 'FAILED_PRECONDITION', JSON.stringify(goldPermissionOnPro.body));
    const employeeOne = await authUser('employee-one@example.test');
    const verifiedEmployeeOne = await verifyEmail(employeeOne);
    const wrongEmployee = await authUser('wrong-employee@example.test');
    const verifiedWrongEmployee = await verifyEmail(wrongEmployee);
    const wrongAcceptance = await call('acceptTeamInvitation', verifiedWrongEmployee.idToken, {
      gymId: 'gym-team-pro', invitationId: inviteOne.body.result.invitationId,
    });
    assert.equal(wrongAcceptance.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(wrongAcceptance.body));
    const acceptedEmployee = await call('acceptTeamInvitation', verifiedEmployeeOne.idToken, {
      gymId: 'gym-team-pro', invitationId: inviteOne.body.result.invitationId,
    });
    assert.equal(acceptedEmployee.status, 200, JSON.stringify(acceptedEmployee.body));
    const employeeRecord = await db.doc('gyms/gym-team-pro/team/' + employeeOne.localId).get();
    assert.equal(employeeRecord.data()?.role, 'staff');
    assert.deepEqual(employeeRecord.data()?.assignedTurnIds, ['turn-morning']);
    assert.equal(employeeRecord.data()?.permissions?.takeAttendance, true);
    const employeeProfile = await db.doc('users/' + employeeOne.localId).get();
    assert.equal(employeeProfile.data()?.currentGymId, 'gym-team-pro');
    const employeeWorkspace = await call('getGymWorkspace', verifiedEmployeeOne.idToken, { gymId: 'gym-team-pro' });
    assert.equal(employeeWorkspace.status, 200, JSON.stringify(employeeWorkspace.body));
    assert.deepEqual(employeeWorkspace.body.result?.catalog?.turns.map(turn => turn.id), ['turn-morning']);
    const forbiddenPermissionUpdate = await call('updateTeamMember', teamOwner.idToken, {
      gymId: 'gym-team-pro', memberUid: employeeOne.localId,
      permissions: { ...basicEmployeePermissions, manageSchedule: true },
      assignedTurnIds: ['turn-morning'],
    });
    assert.equal(forbiddenPermissionUpdate.body.error?.status, 'FAILED_PRECONDITION', JSON.stringify(forbiddenPermissionUpdate.body));

    const freeTeamOwner = await authUser('free-team-owner@example.test');
    const freeTeamEmployee = await authUser('free-team-employee@example.test');
    await db.doc('gyms/gym-team-free').set({
      ownerUid: freeTeamOwner.localId, name: 'Gimnasio Free Equipo',
      status: 'active', plan: 'free',
      scheduleTurns: [{ id: 'turn-free', day: 'Viernes', start: '10:00', end: '11:00', discipline: 'Movilidad' }],
    });
    await db.doc('gyms/gym-team-free/team/' + freeTeamOwner.localId).set({
      uid: freeTeamOwner.localId, role: 'owner', active: true,
    });
    await db.doc('gyms/gym-team-free/team/' + freeTeamEmployee.localId).set({
      uid: freeTeamEmployee.localId, role: 'staff', active: true,
      permissions: { viewSchedule: true }, assignedTurnIds: ['turn-free'],
    });
    const freeEmployeeWorkspace = await call('getGymWorkspace', freeTeamEmployee.idToken, { gymId: 'gym-team-free' });
    assert.equal(freeEmployeeWorkspace.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(freeEmployeeWorkspace.body));
    const freeOwnerWorkspace = await call('getGymWorkspace', freeTeamOwner.idToken, { gymId: 'gym-team-free' });
    assert.equal(freeOwnerWorkspace.status, 200, JSON.stringify(freeOwnerWorkspace.body));

    const teamGoldOwner = await authUser('team-gold-owner@example.test');
    await db.doc('gyms/gym-team-gold').set({
      ownerUid: teamGoldOwner.localId, name: 'Gimnasio Gold Equipo',
      status: 'active', plan: 'gold',
      scheduleTurns: [{ id: 'turn-gold', day: 'Martes', start: '09:00', end: '10:00', discipline: 'Yoga' }],
    });
    await db.doc('gyms/gym-team-gold/team/' + teamGoldOwner.localId).set({
      uid: teamGoldOwner.localId, name: 'Dueño Gold', email: 'team-gold-owner@example.test',
      role: 'owner', active: true, createdAt: FieldValue.serverTimestamp(),
    });
    for (let i = 1; i <= 5; i++) {
      const goldInvite = await call('createTeamInvitation', teamGoldOwner.idToken, {
        gymId: 'gym-team-gold', name: 'Gold ' + i, email: 'gold-' + i + '@example.test',
        permissions: { ...basicEmployeePermissions, approveRequests: true, manageSchedule: true, manageClients: true, manageCatalog: true },
        assignedTurnIds: ['turn-gold'],
      });
      assert.equal(goldInvite.status, 200, JSON.stringify(goldInvite.body));
    }
    const goldTeam = await call('listTeam', teamGoldOwner.idToken, { gymId: 'gym-team-gold' });
    assert.equal(goldTeam.status, 200, JSON.stringify(goldTeam.body));
    assert.equal(goldTeam.body.result?.invitations?.length, 5);

    const invalidId = await call('enrollClientInTurn', winner.idToken, { gymId: '../bad', turnId: 'turn-1' });
    assert.equal(invalidId.body.error?.status, 'INVALID_ARGUMENT', JSON.stringify(invalidId.body));

    console.log('PASS: registro, altas deshabilitadas, inscripción concurrente/cupo único, contador, membresía, idempotencia y aprobación legacy autorizada con cupos transaccionales.');
  } finally {
    await deleteApp(app);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
