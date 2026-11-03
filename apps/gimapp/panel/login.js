// GimAPP · versión 0.4 · 3 de noviembre de 2026.
import { APP_CONFIG } from '../config.js';
import { registerGymOwner, registerGymOwnerWithGoogle, requestPasswordReset, signInGymStaff, signInGymStaffWithGoogle } from '../auth.js';

const loginView = document.querySelector('#login-view');
const ownerRegistrationView = document.querySelector('#owner-registration-view');
const loginForm = document.querySelector('#login-form');
const ownerForm = document.querySelector('#owner-registration-form');
const message = document.querySelector('#login-message');

function showMessage(text) { message.textContent = text; }
function userMessage(error) {
  const code = error?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'El correo o la contraseña no son correctos.';
  if (code.includes('email-already-in-use')) return 'Ese correo ya tiene una cuenta. Ingresá o recuperá la contraseña.';
  if (code.includes('weak-password')) return 'Elegí una contraseña más segura.';
  if (code.includes('popup-closed-by-user')) return 'Se cerró la ventana de Google antes de completar el acceso.';
  if (code.includes('unauthorized-domain')) return 'Firebase no autoriza este dominio para iniciar sesión con Google. En Firebase Console, Authentication → Settings → Authorized domains, agregá localhost o el dominio que estés usando.';
  if (code.includes('popup-blocked')) return 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes para este sitio e intentá nuevamente.';
  if (code.includes('operation-not-allowed')) return 'El método de acceso todavía no está habilitado en Firebase Authentication.';
  return error?.message || 'No se pudo completar la operación. Intentá nuevamente.';
}
function openPanel(membership) {
  const target = new URL('panel/panelindex.html', window.location.href);
  target.searchParams.set('gym', membership.gymId);
  window.location.assign(target);
}
function setView(view) {
  const registering = view === 'register';
  loginView.hidden = registering;
  ownerRegistrationView.hidden = !registering;
  showMessage(registering && !APP_CONFIG.ownerRegistrationEnabled ? 'El registro de gimnasios se habilitará cuando estén terminadas las reglas y condiciones de uso.' : '');
}

// GimAPP login.js · actualización 0.4: mostrar/ocultar contraseñas.
document.querySelectorAll('[data-toggle-password]').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    button.textContent = showing ? 'Ocultar contraseña' : 'Mostrar contraseña';
    button.setAttribute('aria-pressed', String(showing));
  });
});

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(loginForm);
  showMessage('Verificando acceso…');
  try { openPanel((await signInGymStaff({ email: form.get('email'), password: form.get('password') })).membership); }
  catch (error) { console.error('[GimAPP] Falló la operación de autenticación:', error); showMessage(userMessage(error)); }
});
document.querySelector('#login-google').addEventListener('click', async () => {
  showMessage('Abriendo acceso con Google…');
  try { openPanel((await signInGymStaffWithGoogle()).membership); }
  catch (error) { console.error('[GimAPP] Falló la operación de autenticación:', error); showMessage(userMessage(error)); }
});
document.querySelector('#password-reset').addEventListener('click', async () => {
  const email = loginForm.elements.email.value.trim();
  if (!email) { showMessage('Escribí tu correo electrónico para recibir el enlace de recuperación.'); loginForm.elements.email.focus(); return; }
  try { await requestPasswordReset(email); showMessage('Si existe una cuenta con ese correo, vas a recibir un enlace para restablecer la contraseña.'); }
  catch (error) { console.error('[GimAPP] Falló la operación de autenticación:', error); showMessage(userMessage(error)); }
});
ownerForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!APP_CONFIG.ownerRegistrationEnabled) { showMessage('El registro de gimnasios todavía no está habilitado.'); return; }
  const form = new FormData(ownerForm);
  showMessage('Creando el gimnasio…');
  try { const result = await registerGymOwner({ gymName: form.get('gymName'), name: form.get('name'), email: form.get('email'), password: form.get('password') }); openPanel({ gymId: result.gymId }); }
  catch (error) { console.error('[GimAPP] Falló la operación de autenticación:', error); showMessage(userMessage(error)); }
});
document.querySelector('#register-google').addEventListener('click', async () => {
  if (!APP_CONFIG.ownerRegistrationEnabled) { showMessage('El registro de gimnasios todavía no está habilitado.'); return; }
  showMessage('Abriendo acceso con Google…');
  try { const result = await registerGymOwnerWithGoogle({ gymName: ownerForm.elements.gymName.value, name: ownerForm.elements.name.value }); openPanel({ gymId: result.gymId }); }
  catch (error) { console.error('[GimAPP] Falló la operación de autenticación:', error); showMessage(userMessage(error)); }
});
document.querySelector('#show-owner-registration').addEventListener('click', () => setView('register'));
document.querySelector('#show-login').addEventListener('click', () => setView('login'));
