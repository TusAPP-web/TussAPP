const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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

    const disabledUser = await authUser('disabled@example.test');
    const disabled = await register(disabledUser.idToken, 'gym-disabled');
    assert.equal(disabled.body.error?.status, 'FAILED_PRECONDITION', JSON.stringify(disabled.body));

    const invalidId = await call('enrollClientInTurn', winner.idToken, { gymId: '../bad', turnId: 'turn-1' });
    assert.equal(invalidId.body.error?.status, 'INVALID_ARGUMENT', JSON.stringify(invalidId.body));

    console.log('PASS: registro, rechazo cuando está deshabilitado, inscripción concurrente con cupo 1, contador, membresía, asignación e idempotencia.');
  } finally {
    await deleteApp(app);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
