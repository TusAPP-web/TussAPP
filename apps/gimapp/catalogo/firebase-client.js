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
import { doc, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { APP_CONFIG } from '../config.js';
import { getFirebaseServices } from '../firebase.js';

function text(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}
export function catalogGymId() { return new URLSearchParams(window.location.search).get('gym') || ''; }

function validateRegistration({ firstName, lastName, phone, birthDate, turnIds }) {
  if (text(firstName).length < 2 || text(lastName).length < 2 || text(phone).length < 6) throw new Error('Completá nombre, apellido y teléfono.');
  const birth = new Date(`${birthDate}T12:00:00`);
  const adultLimit = new Date();
  adultLimit.setFullYear(adultLimit.getFullYear() - 18);
  if (!birthDate || Number.isNaN(birth.getTime()) || birth > adultLimit) throw new Error('GimAPP admite por ahora solo personas de 18 años o más.');
  if (!Array.isArray(turnIds) || turnIds.length === 0) throw new Error('Elegí al menos un turno con vacante.');
}

export async function loadPublicCatalog(gymId = catalogGymId()) {
  if (!gymId) throw new Error('Falta identificar el gimnasio en el enlace del catálogo.');
  const { db } = await getFirebaseServices();
  const snapshot = await getDoc(doc(db, 'publicCatalog', gymId));
  if (!snapshot.exists() || snapshot.data().published !== true) throw new Error('Este catálogo no está disponible. Pedí al gimnasio su enlace actualizado.');
  return { gymId, ...snapshot.data() };
}

async function saveInitialRequest({ user, gymId, firstName, lastName, phone, birthDate, turnIds, removeNewUserOnFailure }) {
  validateRegistration({ firstName, lastName, phone, birthDate, turnIds });
  if (!APP_CONFIG.clientRegistrationEnabled || !APP_CONFIG.privacyPolicyVersion) throw new Error('El registro de clientes todavía no está habilitado.');
  const { db } = await getFirebaseServices();
  try {
    await setDoc(doc(db, 'gyms', gymId, 'requests', user.uid), {
      clientUid: user.uid, firstName: text(firstName), lastName: text(lastName), phone: text(phone), email: user.email || null,
      birthDate, requestedTurnIds: [...new Set(turnIds)], status: 'pending', privacyPolicyVersion: APP_CONFIG.privacyPolicyVersion,
      consentedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    if (!user.emailVerified && user.email) await sendEmailVerification(user);
    return { gymId, requestId: user.uid };
  } catch (error) {
    if (removeNewUserOnFailure) await deleteUser(user).catch(() => undefined);
    throw error;
  }
}

export async function registerClientWithPassword({ gymId = catalogGymId(), firstName, lastName, phone, birthDate, turnIds, email, password }) {
  if (!gymId) throw new Error('Falta identificar el gimnasio en el enlace del catálogo.');
  const { auth } = await getFirebaseServices();
  const credential = await createUserWithEmailAndPassword(auth, text(email), password);
  return saveInitialRequest({ user: credential.user, gymId, firstName, lastName, phone, birthDate, turnIds, removeNewUserOnFailure: true });
}

export async function registerClientWithGoogle({ gymId = catalogGymId(), firstName, lastName, phone, birthDate, turnIds }) {
  if (!gymId) throw new Error('Falta identificar el gimnasio en el enlace del catálogo.');
  const { auth } = await getFirebaseServices();
  const credential = await signInWithPopup(auth, googleProvider());
  return saveInitialRequest({ user: credential.user, gymId, firstName, lastName, phone, birthDate, turnIds, removeNewUserOnFailure: getAdditionalUserInfo(credential)?.isNewUser === true });
}

export async function signInClientWithPassword({ email, password }) {
  const { auth } = await getFirebaseServices();
  return signInWithEmailAndPassword(auth, text(email), password);
}
export async function signInClientWithGoogle() {
  const { auth } = await getFirebaseServices();
  return signInWithPopup(auth, googleProvider());
}
