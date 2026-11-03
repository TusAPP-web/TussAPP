// GimAPP · versión 0.1 · 3 de noviembre de 2026.
import { signOutUser } from '../auth.js';
import { requireStaffSession } from './session.js';

const session = await requireStaffSession();
if (session) {
  window.GIMAPP_SESSION = session;
  document.querySelector('#sign-out')?.addEventListener('click', async event => {
    event.preventDefault();
    await signOutUser();
    window.location.replace('../index.html');
  });
  await import('./live-panel.js');
}
