// GimAPP · versión 0.1 · 3 de noviembre de 2026.
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { browserLocalPersistence, getAuth, setPersistence } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { APP_CONFIG } from './config.js';

let servicesPromise;

export function assertFirebaseConfigured() {
  if (!APP_CONFIG.firebaseConfigured) throw new Error('Falta completar la configuración pública de Firebase.');
}

export function getFirebaseServices() {
  if (!servicesPromise) {
    assertFirebaseConfigured();
    const app = getApps().length ? getApp() : initializeApp(APP_CONFIG.firebase);
    const auth = getAuth(app);
    servicesPromise = setPersistence(auth, browserLocalPersistence)
      .then(() => ({ app, auth, db: getFirestore(app) }));
  }
  return servicesPromise;
}
