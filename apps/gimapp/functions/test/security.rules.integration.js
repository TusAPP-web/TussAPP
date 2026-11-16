const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, Timestamp } = require('firebase/firestore');

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
      await setDoc(doc(db, 'gyms/gym-pro/team/owner-pro'), {
        uid: 'owner-pro', role: 'owner', active: true,
      });
      await setDoc(doc(db, 'gyms/gym-pro/team/staff-pro'), {
        uid: 'staff-pro', role: 'intermediate', active: true,
      });
      await setDoc(doc(db, 'gyms/gym-pro/team/staff-cash-pro'), {
        uid: 'staff-cash-pro', role: 'staff', active: true,
        permissions: { manageCash: true },
      });
      await setDoc(doc(db, 'gyms/gym-pro/team/staff-gold-manager'), {
        uid: 'staff-gold-manager', role: 'staff', active: true,
        permissions: { manageSchedule: true, manageCatalog: true },
      });
      await setDoc(doc(db, 'gyms/gym-staff'), {
        ownerUid: 'owner-staff', status: 'active', plan: 'free', name: 'Gimnasio privado',
      });
      await setDoc(doc(db, 'gyms/gym-staff/team/staff-basic'), {
        uid: 'staff-basic', role: 'basic', active: true,
      });
      await setDoc(doc(db, 'publicCatalog/gym-staff'), {
        published: false, gymName: 'Gimnasio privado', turns: [{ id: 'turn-private' }],
      });
      await setDoc(doc(db, 'gyms/gym-gold'), {
        ownerUid: 'owner-gold', status: 'active', plan: 'gold', name: 'Gimnasio Gold',
      });
      await setDoc(doc(db, 'gyms/gym-gold/team/staff-gold'), {
        uid: 'staff-gold', role: 'staff', active: true,
        permissions: { viewClients: true, takeAttendance: true },
        assignedTurnIds: ['turn-allowed'],
      });
      await setDoc(doc(db, 'gyms/gym-gold/team/staff-attendance-only'), {
        uid: 'staff-attendance-only', role: 'staff', active: true,
        permissions: { takeAttendance: true },
        assignedTurnIds: ['turn-allowed'],
      });
      await setDoc(doc(db, 'gyms/gym-gold/team/staff-schedule-only'), {
        uid: 'staff-schedule-only', role: 'staff', active: true,
        permissions: { viewSchedule: true },
        assignedTurnIds: ['turn-allowed'],
      });
      await setDoc(doc(db, 'gyms/gym-gold/weeklySchedule/entry-a'), { turnId: 'turn-allowed' });
      await setDoc(doc(db, 'gyms/gym-gold/exceptions/exception-a'), { turnId: 'turn-allowed' });
      await setDoc(doc(db, 'gyms/gym-gold/clients/client-gold'), {
        clientUid: 'client-gold', firstName: 'Cliente', assignedTurnIds: ['turn-allowed'],
      });
      await setDoc(doc(db, 'gyms/gym-gold/clients/client-other-turn'), {
        clientUid: 'client-other-turn', firstName: 'Otro turno', assignedTurnIds: ['turn-other'],
      });

      await setDoc(doc(db, 'gyms/gym-pro'), {
        ownerUid: 'owner-pro', status: 'active', plan: 'pro', name: 'Gimnasio Pro',
      });
      await setDoc(doc(db, 'gyms/gym-expired'), {
        ownerUid: 'owner-expired', status: 'active', plan: 'gold',
        planSource: 'manual', planExpiresAt: Timestamp.fromMillis(Date.now() - 60_000),
      });
      await setDoc(doc(db, 'gyms/gym-expired/team/owner-expired'), {
        uid: 'owner-expired', role: 'owner', active: true,
      });
      await setDoc(doc(db, 'gyms/gym-expired/cash/cash-expired'), {
        type: 'income', amount: 100,
      });
      await setDoc(doc(db, 'gyms/gym-rules/cash/cash-free'), {
        type: 'income', amount: 100,
      });
      await setDoc(doc(db, 'gyms/gym-pro/cash/cash-pro'), {
        type: 'income', amount: 100,
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
    const proOwnerDb = env.authenticatedContext('owner-pro').firestore();
    const proStaffDb = env.authenticatedContext('staff-pro').firestore();
    const proCashStaffDb = env.authenticatedContext('staff-cash-pro').firestore();
    const proGoldManagerDb = env.authenticatedContext('staff-gold-manager').firestore();
    const basicStaffDb = env.authenticatedContext('staff-basic').firestore();
    const expiredOwnerDb = env.authenticatedContext('owner-expired').firestore();
    const goldStaffDb = env.authenticatedContext('staff-gold').firestore();
    const attendanceOnlyDb = env.authenticatedContext('staff-attendance-only').firestore();
    const scheduleOnlyDb = env.authenticatedContext('staff-schedule-only').firestore();

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
    await assertFails(getDoc(doc(ownerDb, 'gyms/gym-rules/cash/cash-free')));
    await assertSucceeds(getDoc(doc(proOwnerDb, 'gyms/gym-pro/cash/cash-pro')));
    await assertSucceeds(updateDoc(doc(proOwnerDb, 'gyms/gym-pro'), { name: 'Gimnasio Pro actualizado' }));
    await assertFails(getDoc(doc(proStaffDb, 'gyms/gym-pro/cash/cash-pro')));
    await assertSucceeds(getDoc(doc(proCashStaffDb, 'gyms/gym-pro/cash/cash-pro')));
    await assertFails(updateDoc(doc(proGoldManagerDb, 'gyms/gym-pro'), { name: 'Cambio no autorizado en Pro' }));
    await assertFails(getDoc(doc(basicStaffDb, 'gyms/gym-staff')));
    await assertFails(getDoc(doc(basicStaffDb, 'publicCatalog/gym-staff')));
    await assertSucceeds(getDoc(doc(ownerDb, 'gyms/gym-rules')));
    await assertFails(getDoc(doc(basicStaffDb, 'gyms/gym-staff/clients/client-a')));
    await assertSucceeds(getDoc(doc(goldStaffDb, 'gyms/gym-gold/clients/client-gold')));
    await assertFails(getDoc(doc(attendanceOnlyDb, 'gyms/gym-gold/clients/client-gold'))); // Solo puede acceder mediante el workspace filtrado.
    await assertFails(getDoc(doc(attendanceOnlyDb, 'gyms/gym-gold/clients/client-other-turn')));
    await assertFails(getDocs(query(
      collection(attendanceOnlyDb, 'gyms/gym-gold/clients'),
      where('assignedTurnIds', 'array-contains-any', ['turn-allowed']),
    )));
    await assertFails(getDoc(doc(scheduleOnlyDb, 'gyms/gym-gold/weeklySchedule/entry-a')));
    await assertFails(getDoc(doc(scheduleOnlyDb, 'gyms/gym-gold/exceptions/exception-a')));
    await assertSucceeds(setDoc(doc(goldStaffDb, 'gyms/gym-gold/attendance/allowed'), {
      trainerUid: 'staff-gold', clientUid: 'client-gold', turnId: 'turn-allowed',
      date: '2026-11-15', status: 'present',
    }));
    await assertFails(setDoc(doc(goldStaffDb, 'gyms/gym-gold/attendance/not-assigned'), {
      trainerUid: 'staff-gold', clientUid: 'client-gold', turnId: 'turn-other',
      date: '2026-11-15', status: 'present',
    }));
    await assertFails(setDoc(doc(goldStaffDb, 'gyms/gym-gold/team/forged-owner'), {
      uid: 'forged-owner', role: 'owner', active: true,
    }));
    await assertFails(getDoc(doc(expiredOwnerDb, 'gyms/gym-expired/cash/cash-expired')));
    await env.withSecurityRulesDisabled(async context => {
      const retainedCash = await getDoc(doc(context.firestore(), 'gyms/gym-expired/cash/cash-expired'));
      assert.equal(retainedCash.exists(), true, 'El vencimiento bloquea el acceso, pero no elimina los datos de Caja.');
      assert.equal(retainedCash.data().amount, 100);
    });

    await assertFails(setDoc(doc(ownerDb, 'gyms/gym-rules/planRequests/direct'), {
      requestedPlan: 'pro', status: 'pending',
    }));
    await assertSucceeds(getDoc(doc(clientDb, 'publicCatalog/gym-rules')));

    console.log('PASS: reglas Firestore impiden escrituras directas de clientes, protegen datos ajenos y permiten lecturas autorizadas.');
  } finally {
    await env.cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
