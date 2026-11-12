// GimAPP · versión 0.1 · 3 de noviembre de 2026.
// Identidad y solicitud inicial del cliente. Las contraseñas no se guardan en Firestore.
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { APP_CONFIG } from '../config.js';
import { getFirebaseServices } from '../firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js';

function text(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}
export function catalogGymId() { return new URLSearchParams(window.location.search).get('gym') || ''; }

export async function loadPublicCatalog(gymId = catalogGymId()) {
  if (!gymId) throw new Error('Falta identificar el gimnasio en el enlace del catálogo.');
  const { db } = await getFirebaseServices();
  const snapshot = await getDoc(doc(db, 'publicCatalog', gymId));
  if (!snapshot.exists() || snapshot.data().published !== true) throw new Error('Este catálogo no está disponible. Pedí al gimnasio su enlace actualizado.');
  return { gymId, ...snapshot.data() };
}

async function saveInitialRequest({ user, gymId, firstName, lastName, phone, birthDate, removeNewUserOnFailure }) {
  if (!APP_CONFIG.clientRegistrationEnabled || !APP_CONFIG.privacyPolicyVersion) throw new Error('El registro de clientes todavía no está habilitado.');
  const { auth } = await getFirebaseServices();
  try {
    const fn = httpsCallable(getFunctions(auth.app, 'southamerica-east1'), 'registerClientProfile');
    const result = await fn({ gymId, firstName, lastName, phone, birthDate, privacyPolicyVersion: APP_CONFIG.privacyPolicyVersion });
    if (!user.emailVerified && user.email) await sendEmailVerification(user).catch(() => undefined);
    return result.data;
  } catch (error) {
    if (removeNewUserOnFailure) await deleteUser(user).catch(() => undefined);
    throw error;
  }
}
export async function registerClientWithPassword({ gymId = catalogGymId(), firstName, lastName, phone, birthDate, email, password }) {
  if (!gymId) throw new Error('Falta identificar el gimnasio.');
  if (!APP_CONFIG.clientRegistrationEnabled || !APP_CONFIG.privacyPolicyVersion) throw new Error('El registro de clientes todavía no está habilitado.');
  const { auth } = await getFirebaseServices();
  const credential = await createUserWithEmailAndPassword(auth, text(email), password);
  return saveInitialRequest({ user: credential.user, gymId, firstName, lastName, phone, birthDate, removeNewUserOnFailure: true });
}
export async function registerClientWithGoogle({ gymId = catalogGymId(), firstName, lastName, phone, birthDate }) {
  if (!gymId) throw new Error('Falta identificar el gimnasio.');
  if (!APP_CONFIG.clientRegistrationEnabled || !APP_CONFIG.privacyPolicyVersion) throw new Error('El registro de clientes todavía no está habilitado.');
  const { auth } = await getFirebaseServices();
  const credential = await signInWithPopup(auth, googleProvider());
  return saveInitialRequest({ user: credential.user, gymId, firstName, lastName, phone, birthDate, removeNewUserOnFailure: getAdditionalUserInfo(credential)?.isNewUser === true });
}
export async function enrollClientInTurn({ gymId = catalogGymId(), turnId }) {
  const { auth } = await getFirebaseServices();
  return (await httpsCallable(getFunctions(auth.app, 'southamerica-east1'), 'enrollClientInTurn')({ gymId, turnId })).data;
}
export async function getMyClientProfile(gymId = catalogGymId()) {
  const { auth, db } = await getFirebaseServices();
  if (!auth.currentUser) throw new Error('Iniciá sesión.');
  const snap = await getDoc(doc(db, 'gyms', gymId, 'clients', auth.currentUser.uid));
  if (!snap.exists()) throw new Error('No hay un registro de cliente para esta cuenta en el gimnasio.');
  return snap.data();
}

export async function signInClientWithPassword({ email, password }) {
  const { auth } = await getFirebaseServices();
  return signInWithEmailAndPassword(auth, text(email), password);
}
export async function signInClientWithGoogle() {
  const { auth } = await getFirebaseServices();
  return signInWithPopup(auth, googleProvider());
}
