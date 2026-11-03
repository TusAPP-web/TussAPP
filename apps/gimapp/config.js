// Versión 0.3 · 3 de noviembre de 2026.
// Esta configuración es pública: Firebase la usa en el navegador. Nunca incluir
// aquí claves de cuentas de servicio, tokens privados ni credenciales de Mercado Pago.
const FIREBASE_WEB_CONFIG = Object.freeze({
  apiKey: 'AIzaSyDcyEx-9kEBVr_kXky-13PhBmhdFPEEqnY',
  authDomain: 'gimapp-67719.firebaseapp.com',
  projectId: 'gimapp-67719',
  storageBucket: 'gimapp-67719.firebasestorage.app',
  messagingSenderId: '857919299458',
  appId: '1:857919299458:web:e15f341099cab1593cf99b',
});

export const firebaseConfigured = Object.values(FIREBASE_WEB_CONFIG).every(Boolean);

export const APP_CONFIG = Object.freeze({
  productName: 'GimAPP',
  backend: 'firebase',
  firebase: FIREBASE_WEB_CONFIG,
  firebaseConfigured,
  // Se activan al publicar reglas verificadas y la política definitiva.
  ownerRegistrationEnabled: true,
  clientRegistrationEnabled: false,
  privacyPolicyVersion: '',
});
