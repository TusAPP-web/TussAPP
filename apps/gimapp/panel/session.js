// GimAPP · versión 0.1 · 3 de noviembre de 2026.
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getStaffMembership, signOutUser } from '../auth.js';
import { getFirebaseServices } from '../firebase.js';

function currentUser(auth) {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function requireStaffSession() {
  const { auth } = await getFirebaseServices();
  const user = await currentUser(auth);
  if (!user) {
    window.location.replace('../index.html');
    return null;
  }
  try {
    return { user, membership: await getStaffMembership(user.uid) };
  } catch (error) {
    await signOutUser().catch(() => undefined);
    window.location.replace('../index.html');
    return null;
  }
}
