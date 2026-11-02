import { APP_CONFIG } from '../config.js';
const form = document.querySelector('#login-form');
form.addEventListener('submit', event => {
  event.preventDefault();
  // No se envía ni persiste la contraseña: no hay proveedor de autenticación configurado.
  form.reset();
  document.querySelector('#login-message').textContent = APP_CONFIG.demoMode
    ? 'Acceso de demostración: falta configurar la autenticación para iniciar sesión.'
    : 'No se pudo iniciar sesión.';
});
