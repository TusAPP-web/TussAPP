import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js';
import { getFirebaseServices } from '../firebase.js';

const loginView = document.querySelector('#login-view');
const adminView = document.querySelector('#admin-view');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const adminMessage = document.querySelector('#admin-message');
const requestsElement = document.querySelector('#requests');
const signOutButton = document.querySelector('#sign-out');
let services;
let activeUser;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function showError(error, target = adminMessage) {
  target.textContent = error?.message || 'No se pudo completar la operación.';
}
function setSignedIn(user) {
  activeUser = user;
  loginView.hidden = Boolean(user);
  adminView.hidden = !user;
  signOutButton.hidden = !user;
  if (user) {
    document.querySelector('#admin-identity').textContent = 'Cuenta: ' + (user.email || user.uid);
    loadRequests();
  }
}
async function loadRequests() {
  requestsElement.innerHTML = '<div class="empty">Cargando solicitudes…</div>';
  adminMessage.textContent = '';
  try {
    const list = httpsCallable(getFunctions(services.app, 'southamerica-east1'), 'listPendingPlanChangeRequests');
    const result = await list({});
    const items = result.data?.requests || [];
    if (!items.length) {
      requestsElement.innerHTML = '<div class="empty">No hay solicitudes de cambio de plan pendientes.</div>';
      return;
    }
    requestsElement.innerHTML = items.map(item => `
      <article class="request-card">
        <h2>${escapeHtml(item.gymName || 'Gimnasio sin nombre')}</h2>
        <div class="request-meta">
          Gimnasio: ${escapeHtml(item.gymId)}<br>
          Plan actual: ${escapeHtml((item.currentPlan || 'free').toUpperCase())}<br>
          Solicita: <b>${escapeHtml((item.requestedPlan || '').toUpperCase())}</b><br>
          Fecha: ${item.createdAt ? escapeHtml(new Date(item.createdAt).toLocaleString('es-AR')) : '—'}
        </div>
        <div class="request-actions">
          <button class="button approve" data-decision="approve" data-gym="${escapeHtml(item.gymId)}" data-request="${escapeHtml(item.id)}">Aprobar solicitud</button>
          <button class="button reject" data-decision="reject" data-gym="${escapeHtml(item.gymId)}" data-request="${escapeHtml(item.id)}">Rechazar</button>
        </div>
      </article>`).join('');
  } catch (error) {
    requestsElement.innerHTML = '';
    if (error?.code === 'functions/permission-denied') {
      adminMessage.textContent = 'Esta cuenta todavía no está habilitada como administradora de TusAPP. UID: ' + activeUser.uid;
    } else {
      showError(error);
    }
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginMessage.textContent = 'Verificando acceso…';
  try {
    await signInWithEmailAndPassword(services.auth, loginForm.elements.email.value.trim(), loginForm.elements.password.value);
  } catch (error) { showError(error, loginMessage); }
});
document.querySelector('#google-login').addEventListener('click', async () => {
  loginMessage.textContent = 'Abriendo Google…';
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(services.auth, provider);
  } catch (error) { showError(error, loginMessage); }
});
document.querySelector('#manual-grant-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const gymId = form.elements.gymId.value.trim();
  const plan = form.elements.plan.value;
  const duration = form.elements.duration.value;
  const reason = form.elements.reason.value.trim();
  if (!gymId || !reason || !['pro', 'gold'].includes(plan)) {
    adminMessage.textContent = 'Completá el gimnasio, el plan y el motivo.';
    return;
  }
  const permanent = duration === 'permanent';
  const expiresAt = permanent ? null : new Date(Date.now() + Number(duration) * 86400000).toISOString();
  const period = permanent ? 'sin vencimiento' : 'por ' + duration + ' días';
  if (!window.confirm('¿Habilitar ' + plan.toUpperCase() + ' gratis para ' + gymId + ' ' + period + '?')) return;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  adminMessage.textContent = 'Registrando habilitación manual…';
  try {
    const grant = httpsCallable(getFunctions(services.app, 'southamerica-east1'), 'grantPlanManually');
    const result = await grant({ gymId, plan, reason, expiresAt });
    adminMessage.textContent = 'Plan ' + result.data.plan.toUpperCase() + ' habilitado gratuitamente para ' +
      result.data.gymId + (result.data.expiresAt ? '. Vence: ' + new Date(result.data.expiresAt).toLocaleString('es-AR') : '. Habilitación permanente.');
    form.reset();
  } catch (error) {
    showError(error);
  } finally {
    submit.disabled = false;
  }
});
document.querySelector('#refresh').addEventListener('click', loadRequests);
signOutButton.addEventListener('click', () => signOut(services.auth));
requestsElement.addEventListener('click', async event => {
  const button = event.target.closest('[data-decision]');
  if (!button) return;
  button.disabled = true;
  adminMessage.textContent = 'Guardando decisión…';
  try {
    const resolve = httpsCallable(getFunctions(services.app, 'southamerica-east1'), 'resolvePlanChangeRequest');
    const result = await resolve({
      gymId: button.dataset.gym,
      requestId: button.dataset.request,
      decision: button.dataset.decision,
    });
    adminMessage.textContent = result.data?.status === 'approved_waiting_payment'
      ? 'Solicitud aprobada. Queda pendiente de pago; el plan todavía no se activa.'
      : 'Solicitud rechazada.';
    await loadRequests();
  } catch (error) {
    button.disabled = false;
    showError(error);
  }
});

try {
  services = await getFirebaseServices();
  onAuthStateChanged(services.auth, setSignedIn);
} catch (error) {
  loginMessage.textContent = error?.message || 'No se pudo iniciar la administración.';
}
