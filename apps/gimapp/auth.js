// GimAPP · versión 0.1 · 3 de noviembre de 2026.
// Las contraseñas se validan en Firebase Authentication y nunca se guardan en Firestore.
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { APP_CONFIG } from './config.js';
import { getFirebaseServices } from './firebase.js';

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

async function createOwnerGym({ user, gymName, name, removeNewUserOnFailure }) {
  const normalizedGymName = cleanText(gymName);
  const normalizedName = cleanText(name);
  if (normalizedGymName.length < 2 || normalizedName.length < 2) {
    throw new Error('Completá el nombre del gimnasio y de la persona responsable.');
  }
  const { db } = await getFirebaseServices();
  const gymRef = doc(collection(db, 'gyms'));
  const gymId = gymRef.id;
  const now = serverTimestamp();

  try {
    const batch = writeBatch(db);
    batch.set(gymRef, { name: normalizedGymName, ownerUid: user.uid, plan: 'free', status: 'active', createdAt: now, updatedAt: now });
    batch.set(doc(db, 'gyms', gymId, 'team', user.uid), { uid: user.uid, name: normalizedName, email: user.email, role: 'owner', active: true, createdAt: now });
    batch.set(doc(db, 'users', user.uid), { accountType: 'staff', currentGymId: gymId, createdAt: now, updatedAt: now });
    await batch.commit();
    if (!user.emailVerified) await sendEmailVerification(user);
    return { gymId, user };
  } catch (error) {
    if (removeNewUserOnFailure) await deleteUser(user).catch(() => undefined);
    throw error;
  }
}

export async function registerGymOwner({ gymName, name, email, password }) {
  if (!APP_CONFIG.ownerRegistrationEnabled) throw new Error('El registro de gimnasios todavía no está habilitado.');
  const { auth } = await getFirebaseServices();
  const credential = await createUserWithEmailAndPassword(auth, cleanText(email), password);
  return createOwnerGym({ gymName, name, user: credential.user, removeNewUserOnFailure: true });
}

export async function registerGymOwnerWithGoogle({ gymName, name }) {
  if (!APP_CONFIG.ownerRegistrationEnabled) throw new Error('El registro de gimnasios todavía no está habilitado.');
  const { auth } = await getFirebaseServices();
  const credential = await signInWithPopup(auth, googleProvider());
  return createOwnerGym({ gymName, name, user: credential.user, removeNewUserOnFailure: getAdditionalUserInfo(credential)?.isNewUser === true });
}

export async function getStaffMembership(uid) {
  const { db } = await getFirebaseServices();
  const userSnapshot = await getDoc(doc(db, 'users', uid));
  if (!userSnapshot.exists() || userSnapshot.data().accountType !== 'staff') {
    throw new Error('Esta cuenta no tiene acceso al panel de un gimnasio.');
  }
  const gymId = userSnapshot.data().currentGymId;
  if (typeof gymId !== 'string' || !gymId) {
    throw new Error('Esta cuenta no tiene un gimnasio asociado.');
  }
  const memberSnapshot = await getDoc(doc(db, 'gyms', gymId, 'team', uid));
  if (!memberSnapshot.exists() || memberSnapshot.data().uid !== uid || memberSnapshot.data().active !== true) {
    throw new Error('Esta cuenta no tiene acceso activo al panel de ese gimnasio.');
  }
  return { gymId, ...memberSnapshot.data() };
}

async function finishStaffSignIn(auth, user) {
  try {
    return { user, membership: await getStaffMembership(user.uid) };
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export async function signInGymStaff({ email, password }) {
  const { auth } = await getFirebaseServices();
  const credential = await signInWithEmailAndPassword(auth, cleanText(email), password);
  return finishStaffSignIn(auth, credential.user);
}

export async function signInGymStaffWithGoogle() {
  const { auth } = await getFirebaseServices();
  const credential = await signInWithPopup(auth, googleProvider());
  return finishStaffSignIn(auth, credential.user);
}

export async function requestPasswordReset(email) {
  const { auth } = await getFirebaseServices();
  await sendPasswordResetEmail(auth, cleanText(email));
}

export async function signOutUser() {
  const { auth } = await getFirebaseServices();
  await signOut(auth);
}
