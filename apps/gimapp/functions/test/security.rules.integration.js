const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-gimapp',
    firestore: { rules: fs.readFileSync('../firestore.rules', 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'gyms/gym-rules/clients/client-a'), {
        clientUid: 'client-a', firstName: 'Cliente', assignedTurnIds: [],
      });
      await setDoc(doc(db, 'gyms/gym-rules/requests/client-a'), {
        clientUid: 'client-a', status: 'registered',
      });
      await setDoc(doc(db, 'gyms/gym-rules/team/owner-a'), {
        uid: 'owner-a', role: 'owner', active: true,
      });
      await setDoc(doc(db, 'gyms/gym-rules'), {
        ownerUid: 'owner-a', status: 'active', plan: 'free', name: 'Gimnasio de prueba',
      });
      await setDoc(doc(db, 'publicCatalog/gym-rules'), {
        published: true, turns: [],
      });
    });

    const clientDb = env.authenticatedContext('client-a').firestore();
    const otherDb = env.authenticatedContext('client-b').firestore();
    const anonymousDb = env.unauthenticatedContext().firestore();
    const ownerDb = env.authenticatedContext('owner-a').firestore();

    await assertSucceeds(getDoc(doc(clientDb, 'gyms/gym-rules/clients/client-a')));
    await assertFails(getDoc(doc(otherDb, 'gyms/gym-rules/clients/client-a')));
    await assertFails(getDoc(doc(anonymousDb, 'gyms/gym-rules/clients/client-a')));
    await assertSucceeds(getDoc(doc(clientDb, 'gyms/gym-rules/requests/client-a')));
    await assertFails(setDoc(doc(clientDb, 'gyms/gym-rules/requests/client-b'), {
      clientUid: 'client-a', status: 'pending',
    }));
    await assertFails(updateDoc(doc(clientDb, 'gyms/gym-rules/clients/client-a'), {
      assignedTurnIds: ['turn-1'],
    }));
    await assertFails(setDoc(doc(clientDb, 'gyms/gym-rules/turnEnrollments/turn-1'), {
      enrolled: 1,
    }));
    await assertSucceeds(getDoc(doc(ownerDb, 'gyms/gym-rules/clients/client-a')));
    await assertSucceeds(getDoc(doc(clientDb, 'publicCatalog/gym-rules')));

    console.log('PASS: reglas Firestore impiden escrituras directas de clientes, protegen datos ajenos y permiten lecturas autorizadas.');
  } finally {
    await env.cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
