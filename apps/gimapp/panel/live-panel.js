// GimAPP · versión 0.1 · 3 de noviembre de 2026.
import { approveRequest, addCashEntry, getCatalogConfiguration, getCashEntries, getClients, getGymProfile, getPendingRequests, getPlanRequests, rejectRequest, requestPlanChange, saveAttendance, saveGymSchedule, savePublicCatalog, updateGymProfile } from './data.js';

const app = document.querySelector('#app');
const nav = document.querySelector('#main-nav');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modal-content');
const { user, membership } = window.GIMAPP_SESSION;
const weekDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
let page = 'inicio', month = new Date(), selectedDate = new Date(), state = { gym: null, catalog: { turns: [] }, requests: [], planRequests: [], clients: [], cash: [] };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const initials = name => name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const person = name => `<span class="person"><span class="avatar">${esc(initials(name))}</span>${esc(name)}</span>`;
function effectivePlan(gym) {
  const expiry = gym?.planExpiresAt?.toDate
    ? gym.planExpiresAt.toDate().getTime()
    : gym?.planExpiresAt ? new Date(gym.planExpiresAt).getTime() : null;
  if (['pro', 'gold'].includes(gym?.plan) && expiry !== null && expiry <= Date.now()) return 'free';
  return gym?.plan || 'free';
}
function hasPaidPlan(gym) {
  return ['pro', 'gold'].includes(effectivePlan(gym));
}

function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }
function heading(title, subtitle, action = '') { return `<div class="page-heading"><div><span class="eyebrow">${esc(state.gym?.name || 'GIMAPP')}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function table(rows, headers) { return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(item => `<th>${item}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`; }
function openModal(title, body, actions = '') { modalContent.innerHTML = `<div class="modal-inner"><div class="modal-head"><h2>${title}</h2><button class="close" data-close aria-label="Cerrar">×</button></div>${body}<div class="modal-actions">${actions}</div></div>`; modal.showModal(); }
async function load() {
  const gym = await getGymProfile(membership.gymId);
  const [catalog, requests, clients, cash, planRequests] = await Promise.all([
    getCatalogConfiguration(membership.gymId),
    getPendingRequests(membership.gymId),
    getClients(membership.gymId),
    hasPaidPlan(gym) ? getCashEntries(membership.gymId) : Promise.resolve([]),
    membership.role === 'owner' ? getPlanRequests(membership.gymId) : Promise.resolve([]),
  ]);
  state = { gym, catalog, requests, clients, cash, planRequests };
  document.querySelectorAll('[data-gym-name]').forEach(el => { el.textContent = gym.name; });
  document.querySelectorAll('[data-plan-name]').forEach(el => { el.textContent = effectivePlan(gym) === 'free' ? 'Gratis' : effectivePlan(gym).toUpperCase(); });
  const cashNav = nav.querySelector('[data-page="caja"]');
  if (cashNav) cashNav.classList.toggle('locked', !hasPaidPlan(gym));
  const badge = document.querySelector('#request-badge');
  if (badge) { badge.hidden = requests.length === 0; badge.textContent = requests.length || ''; }
}

function home() {
  const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = new Date(first); start.setDate(first.getDate() - first.getDay());
  const cells = Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); const dayTurns = state.catalog.turns.filter(turn => turn.day === weekDays[day.getDay()]); return `<button class="calendar-cell ${day.getMonth() !== month.getMonth() ? 'outside' : ''}" data-date="${dateKey(day)}"><span class="day-number">${day.getDate()}</span><span class="day-turn-count">${dayTurns.length} turnos</span>${dayTurns.slice(0, 2).map(turn => `<span class="turn-chip">${esc(turn.start)} · ${esc(turn.discipline)}</span>`).join('')}</button>`; }).join('');
  const tasks = state.requests.length ? `<section class="card home-tasks"><div class="card-head"><h2>Tareas pendientes</h2><span class="status pending">${state.requests.length} pendientes</span></div>${state.requests.map(item => `<div class="task-item"><span class="task-icon">✳</span><div><b>Solicitud de ${esc(`${item.firstName} ${item.lastName}`)}</b><p>Esperando revisión.</p><a href="#" data-page="solicitudes">Revisar →</a></div></div>`).join('')}</section>` : '';
  return `${heading('Inicio', 'Calendario y tareas que necesitan atención')}${tasks}<section class="card calendar-card"><div class="card-head"><h2>Calendario</h2><button class="button small" data-action="today">Hoy</button></div><div class="calendar-toolbar"><div class="switch"><button class="button small" data-action="prev-month">‹</button><button class="button small" data-action="next-month">›</button><strong>${new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(month)}</strong></div></div><div class="calendar-grid">${['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => `<div class="calendar-dayname">${day}</div>`).join('')}${cells}</div></section>`;
}
function requestsPage() { return `${heading('Solicitudes', 'Revisá los datos y horarios antes de decidir.')}<section class="card"><div class="card-head"><h2>Altas pendientes</h2><span class="status pending">${state.requests.length} por revisar</span></div>${state.requests.length ? table(state.requests.map(item => `<tr><td>${person(`${item.firstName} ${item.lastName}`)}</td><td>${esc(item.phone)}<div class="small muted">${esc(item.email || '')}</div></td><td>${esc((item.requestedTurnIds || []).join(', '))}</td><td><button class="button small soft" data-action="approve-request" data-id="${item.id}">Aprobar</button> <button class="button small" data-action="reject-request" data-id="${item.id}">Rechazar</button></td></tr>`).join(''), ['Cliente', 'Contacto', 'Turnos solicitados', '']) : '<div class="empty"><strong>No hay solicitudes pendientes</strong>Cuando llegue una nueva, aparecerá aquí.</div>'}</section>`; }
function clientsPage() { return `${heading('Clientes', 'Clientes registrados y turnos asignados.')}<section class="card">${state.clients.length ? table(state.clients.map(client => `<tr><td><b>${esc(client.displayId || client.id)}</b></td><td>${person(`${client.firstName} ${client.lastName}`)}</td><td>${esc(client.status === 'registered' ? 'Registrado, sin turnos' : client.status || '—')}</td><td>${esc((client.assignedTurnIds || []).map(id => { const t = state.catalog.turns.find(x => x.id === id); return t ? `${t.day} ${t.start} · ${t.discipline}` : id; }).join(', ') || 'Sin turnos')}</td></tr>`).join(''), ['ID', 'Nombre y apellido', 'Estado', 'Turnos asignados']) : '<div class="empty"><strong>Aún no hay clientes registrados</strong>Las nuevas cuentas aparecerán aquí automáticamente.</div>'}</section>`; }
function turnsForDate(date) { const day = weekDays[date.getDay()]; return state.catalog.turns.filter(turn => turn.day === day); }
function datePage() { const turns = turnsForDate(selectedDate); return `${heading(new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(selectedDate), 'Abrí un turno para pasar asistencia.', '<button class="button" data-page="inicio">← Volver</button>')}<section class="card">${turns.length ? turns.map(turn => { const clients = state.clients.filter(client => (client.assignedTurnIds || []).includes(turn.id)); return `<div class="turn-day"><div class="turn-day-button"><span class="turn-hour">${esc(turn.start)}–${esc(turn.end)}</span><span><b>${esc(turn.discipline)}</b><small>${clients.length} clientes asignados</small></span><span class="vacancy-count">${Math.max(0, Number(turn.capacity) - clients.length)} vacantes</span></div><div class="roster">${clients.map(client => `<div class="roster-row"><span>${person(`${client.firstName} ${client.lastName}`)}<small class="roster-id">${esc(client.displayId || client.id)}</small></span><button class="button small" data-action="attendance" data-client="${client.clientUid}" data-turn="${esc(turn.id)}" data-status="present">Presente</button><button class="button small danger" data-action="attendance" data-client="${client.clientUid}" data-turn="${esc(turn.id)}" data-status="absent">Ausente</button></div>`).join('') || '<p class="small muted">No hay clientes asignados a este turno.</p>'}</div></div>`; }).join('') : '<div class="empty"><strong>No hay turnos configurados para este día</strong>Agregalos desde Configuración.</div>'}</section>`; }
function cashPage() { if (!hasPaidPlan(state.gym)) return `${heading('Caja monetaria', 'Una herramienta incluida en los planes Pro y Gold.')}<section class="card locked-feature"><div class="locked-feature-icon">🔒</div><h2>Beneficio de la versión Pro</h2><p class="muted">La Caja y sus movimientos se conservan, pero para consultar o registrar movimientos necesitás tener activo GimAPP Pro o Gold.</p><button class="button primary" data-action="show-benefit" data-plan="pro" data-feature="Caja monetaria">Conocer el beneficio Pro</button></section>`; const rows = state.cash.map(entry => `<tr><td>${esc(entry.date)}</td><td>${esc(entry.category)}</td><td>${esc(entry.note || '—')}</td><td><span class="status ${entry.type === 'expense' ? 'absent' : ''}">${entry.type === 'income' ? 'Ingreso' : 'Egreso'}</span></td><td>${money.format(entry.amount)}</td></tr>`).join(''); const income = state.cash.filter(entry => entry.type === 'income').reduce((sum, entry) => sum + Number(entry.amount), 0); const expense = state.cash.filter(entry => entry.type === 'expense').reduce((sum, entry) => sum + Number(entry.amount), 0); return `${heading('Caja monetaria', 'Ingresos y egresos manuales, categorías y balance.', '<button class="button primary" data-action="new-cash">＋ Registrar movimiento</button>')}<section class="card"><div class="grid three"><div class="stat-card"><div><span class="muted small">Ingresos</span><div class="stat-value">${money.format(income)}</div></div></div><div class="stat-card"><div><span class="muted small">Egresos</span><div class="stat-value">${money.format(expense)}</div></div></div><div class="stat-card"><div><span class="muted small">Balance</span><div class="stat-value">${money.format(income - expense)}</div></div></div></div><div class="section-label">Movimientos</div>${rows ? table(rows, ['Fecha', 'Categoría', 'Detalle', 'Tipo', 'Importe']) : '<div class="empty"><strong>Sin movimientos</strong>Registrá un ingreso o egreso manual.</div>'}</section>`; }
function settingsPage() {
  const turns = state.catalog.turns || [];
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const rows = turns.map((turn, index) => `<div class="schedule-editor-row" data-schedule-row data-turn-id="${esc(turn.id)}" data-enrolled="${Number(turn.enrolled)||0}" data-waitlist="${turn.waitlist !== false}">
    <label class="field">Día<select class="select schedule-day">${days.map(day => `<option ${turn.day === day ? 'selected' : ''}>${day}</option>`).join('')}</select></label>
    <label class="field">Desde<input class="schedule-start" type="time" value="${esc(turn.start)}"></label>
    <label class="field">Hasta<input class="schedule-end" type="time" value="${esc(turn.end)}"></label>
    <label class="field">Disciplina<input class="schedule-discipline" value="${esc(turn.discipline)}"></label>
    <label class="field">Instructor (opcional)<input class="schedule-instructor" value="${esc(turn.instructor || '')}" placeholder="Nombre del instructor"></label>
    <label class="field">Cupo<input class="schedule-capacity" type="number" min="1" value="${Number(turn.capacity) || 10}"></label>
    <button class="button small danger" type="button" data-action="remove-schedule-row">Quitar</button>
  </div>`).join('');
  return `${heading('Configuración', 'Datos del gimnasio y horarios de actividades.')}
    <section class="card">
      <div class="card-head"><h2>Datos del gimnasio</h2></div>
      <label class="field">Nombre del gimnasio<input id="gym-name" value="${esc(state.gym.name)}"></label>
      <label class="field">Plazo de aviso de ausencia (horas)<input id="absence-hours" type="number" min="0" value="${Number(state.gym.absenceNoticeHours || 12)}"></label>
      <button class="button primary" data-action="save-gym">Guardar configuración</button>
    </section>
    <section class="card" style="margin-top:16px">
      <div class="card-head"><h2>Horarios de actividades</h2></div>
      <p class="small muted">Configurá los días, horarios, disciplinas e instructores. El instructor es opcional.</p>
      <label class="consent"><input id="allow-overlaps" type="checkbox" ${state.catalog.allowScheduleOverlaps ? 'checked' : ''}><span>Permitir superposición de horarios (distintas disciplinas o instructores).</span></label>
      <div id="schedule-editor">${rows || '<p class="small muted">Todavía no hay horarios configurados.</p>'}</div>
      <button class="button" data-action="add-schedule-row">＋ Agregar horario</button>
      <div class="section-label">Publicación del catálogo</div>
      <label class="field">Nombre público<input id="catalog-name" value="${esc(state.catalog.gymName || state.gym.name)}"></label>
      <label class="consent"><input id="catalog-published" type="checkbox" ${state.catalog.published ? 'checked' : ''}><span>Publicar estos horarios para clientes.</span></label>
      <button class="button primary" data-action="save-schedule">Guardar horarios y publicar configuración</button>
    </section>`;
}
function plansPage() {
  const currentPlan = effectivePlan(state.gym);
  const currentLabel = ({ free: 'Gratis', pro: 'Pro', gold: 'Gold' })[currentPlan] || currentPlan;
  const latest = state.planRequests[0];
  const lockedRequest = latest && ['pending', 'approved_waiting_payment'].includes(latest.status);
  const statusLabel = latest?.status === 'pending' ? 'En revisión por TusAPP'
    : latest?.status === 'approved_waiting_payment' ? 'Aprobada · pendiente de pago'
    : latest?.status === 'rejected' ? 'Solicitud anterior rechazada' : '';
  const canRequestPro = membership.role === 'owner' && currentPlan === 'free' && !lockedRequest;
  const canRequestGold = membership.role === 'owner' && currentPlan !== 'gold' && !lockedRequest;
  const manualGrantNotice = state.gym.planSource === 'manual' && ['pro', 'gold'].includes(currentPlan)
    ? `<div class="notice">Este gimnasio tiene una habilitación gratuita de prueba${state.gym.planExpiresAt?.toDate ? ' hasta el ' + esc(state.gym.planExpiresAt.toDate().toLocaleDateString('es-AR')) : ' permanente'}.</div>`
    : '';
  const requestButton = (plan, enabled) => enabled
    ? `<button class="button primary full" data-action="request-plan" data-plan="${plan}">Solicitar migración a ${plan === 'pro' ? 'Pro' : 'Gold'}</button>`
    : '';
  return `${heading('Planes de GimAPP', 'Elegí el plan que acompaña el crecimiento de tu gimnasio.')}
    <section class="card">
      <div class="card-head"><h2>Tu plan actual</h2><span class="status">${esc(currentLabel)}</span></div>
      <p class="muted">Las funciones de tu gimnasio se habilitan según el plan asignado por TusAPP.</p>
      ${manualGrantNotice}
      ${latest ? `<div class="notice"><b>Última solicitud:</b> ${esc(statusLabel)}. Plan solicitado: ${esc(latest.requestedPlan?.toUpperCase() || '—')}.${latest.status === 'approved_waiting_payment' ? ' El plan no se activa hasta que se confirme el pago.' : ''}</div>` : ''}
      ${lockedRequest ? '<p class="small muted">No podés enviar otra solicitud mientras esta siga pendiente o esperando el pago.</p>' : ''}
    </section>
    <div class="grid two" style="margin-top:16px">
      <section class="card">
        <span class="eyebrow">PARA EMPEZAR</span><h2>Gratis</h2><div class="stat-value">USD 0</div>
        <p class="small muted">Sin costo y sin límite de tiempo.</p>
        <ul class="plan-list"><li>Calendario y horarios</li><li>Clientes y turnos</li><li>Solicitudes y asistencia</li><li>Catálogo básico</li><li>1 cuenta: dueño</li></ul>
        ${currentPlan === 'free' ? '<span class="status">Tu plan actual</span>' : ''}
      </section>
      <section class="card">
        <span class="eyebrow">MÁS HERRAMIENTAS</span><h2>Pro</h2><div class="stat-value">USD 5 <span class="small muted">/ mes</span></div>
        <p class="small muted">Precio promocional durante los primeros 6 meses; luego USD 10 por mes.</p>
        <ul class="plan-list"><li>Todo lo incluido en Gratis</li><li>Caja e informes</li><li>Catálogo personalizado</li><li>Varios profesionales</li><li>Hasta 3 cuentas en total</li></ul>
        ${currentPlan === 'pro' ? '<span class="status">Tu plan actual</span>' : requestButton('pro', canRequestPro)}
      </section>
      <section class="card">
        <span class="eyebrow">GESTIÓN AVANZADA</span><h2>Gold</h2><div class="stat-value">USD 7,50 <span class="small muted">/ mes</span></div>
        <p class="small muted">Precio promocional durante los primeros 6 meses; luego USD 15 por mes.</p>
        <ul class="plan-list"><li>Todo lo incluido en Pro</li><li>Usuarios internos ilimitados</li><li>Roles y permisos avanzados</li><li>Herramientas avanzadas de gestión</li></ul>
        ${currentPlan === 'gold' ? '<span class="status">Tu plan actual</span>' : requestButton('gold', canRequestGold)}
      </section>
    </div>
    <section class="card" style="margin-top:16px">
      <h2>Condiciones de precio</h2>
      <p class="small muted">Los importes se expresan como referencia en dólares. Cuando se habiliten los pagos, se cobrarán en pesos argentinos, calculados con la cotización oficial definida por TusAPP para el día del pago. Los pagos todavía no están habilitados.</p>
      ${membership.role !== 'owner' ? '<p class="small muted">Solo el dueño del gimnasio puede solicitar un cambio de plan.</p>' : ''}
    </section>`;
}
function view() { return ({ inicio: home, solicitudes: requestsPage, clientes: clientsPage, fecha: datePage, caja: cashPage, configuracion: settingsPage, planes: plansPage }[page] || home)(); }
async function render() { app.innerHTML = '<div class="empty"><strong>Cargando…</strong></div>'; try { await load(); const content = view(); nav.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page)); app.innerHTML = content; } catch (error) { app.innerHTML = `<div class="empty"><strong>No se pudieron cargar los datos</strong>${esc(error.message)}</div>`; } }

function showBenefitModal(requiredPlan, feature) {
  const label = requiredPlan === 'gold' ? 'Gold' : 'Pro';
  openModal('Beneficio de la versión ' + label,
    `<p>“${esc(feature)}” es una herramienta incluida en GimAPP ${label}.</p><p class="muted">Tus datos se conservan. Para seguir consultando o utilizando esta herramienta, necesitás tener activo el plan correspondiente.</p>`,
    '<button class="button" data-close>Cerrar</button><button class="button primary" data-page="planes">Conocer planes</button>');
}
nav.addEventListener('click', event => {
  const item = event.target.closest('[data-page]');
  if (item) {
    page = item.dataset.page;
    render();
    if (page === 'caja' && !hasPaidPlan(state.gym)) showBenefitModal('pro', 'Caja monetaria');
  }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action], [data-date], [data-page], [data-close]'); if (!button) return;
  if (button.dataset.page) { event.preventDefault(); page = button.dataset.page; render(); return; }
  if (button.dataset.date) { selectedDate = new Date(`${button.dataset.date}T12:00:00`); page = 'fecha'; render(); return; }
  const action = button.dataset.action;
  if (action === 'today') { month = new Date(); render(); }
  if (action === 'prev-month') { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); render(); }
  if (action === 'next-month') { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); render(); }
  if (action === 'approve-request') { await approveRequest({ gymId: membership.gymId, requestId: button.dataset.id, actorUid: user.uid }); toast('Solicitud aprobada.'); render(); }
  if (action === 'reject-request') { await rejectRequest({ gymId: membership.gymId, requestId: button.dataset.id, actorUid: user.uid }); toast('Solicitud rechazada.'); render(); }
  if (action === 'request-plan') {
    try {
      await requestPlanChange({ gymId: membership.gymId, requestedPlan: button.dataset.plan });
      toast('Solicitud enviada a TusAPP.');
      render();
    } catch (error) {
      toast(error?.message || 'No se pudo enviar la solicitud.');
    }
  }
  if (action === 'attendance') { await saveAttendance({ gymId: membership.gymId, trainerUid: user.uid, clientUid: button.dataset.client, turnId: button.dataset.turn, date: dateKey(selectedDate), status: button.dataset.status }); toast('Asistencia guardada.'); }
  if (action === 'show-benefit') { showBenefitModal(button.dataset.plan || 'pro', button.dataset.feature || 'Esta herramienta'); return; }
  if (action === 'new-cash' && !hasPaidPlan(state.gym)) { showBenefitModal('pro', 'Caja monetaria'); return; }
  if (action === 'new-cash') openModal('Registrar movimiento', '<label class="field">Tipo<select id="cash-type" class="select"><option value="income">Ingreso</option><option value="expense">Egreso</option></select></label><label class="field">Importe<input id="cash-amount" type="number" min="1"></label><label class="field">Categoría<input id="cash-category"></label><label class="field">Detalle<input id="cash-note"></label><label class="field">Fecha<input id="cash-date" type="date" value="' + dateKey(new Date()) + '"></label>', '<button class="button" data-close>Cancelar</button><button class="button primary" data-action="save-cash">Guardar</button>');
  if (action === 'save-cash' && !hasPaidPlan(state.gym)) { showBenefitModal('pro', 'Caja monetaria'); return; }
  if (action === 'save-cash') { await addCashEntry({ gymId: membership.gymId, type: document.querySelector('#cash-type').value, amount: document.querySelector('#cash-amount').value, category: document.querySelector('#cash-category').value, note: document.querySelector('#cash-note').value, date: document.querySelector('#cash-date').value, actorUid: user.uid }); modal.close(); toast('Movimiento guardado.'); render(); }
  if (action === 'add-schedule-row') {
    const editor = document.querySelector('#schedule-editor');
    editor.querySelector('.muted')?.remove();
    const row = document.createElement('div');
    row.className = 'schedule-editor-row';
    row.setAttribute('data-schedule-row', '');
    row.innerHTML = `<label class="field">Día<select class="select schedule-day">${['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(day => `<option>${day}</option>`).join('')}</select></label><label class="field">Desde<input class="schedule-start" type="time" value="08:00"></label><label class="field">Hasta<input class="schedule-end" type="time" value="09:00"></label><label class="field">Disciplina<input class="schedule-discipline" placeholder="Ej. Funcional"></label><label class="field">Instructor (opcional)<input class="schedule-instructor" placeholder="Nombre del instructor"></label><label class="field">Cupo<input class="schedule-capacity" type="number" min="1" value="10"></label><button class="button small danger" type="button" data-action="remove-schedule-row">Quitar</button>`;
    editor.append(row);
  }
  if (action === 'remove-schedule-row') button.closest('[data-schedule-row]')?.remove();
  if (action === 'save-schedule') {
    const turns = [...document.querySelectorAll('[data-schedule-row]')].map((row, index) => ({
      id: row.dataset.turnId || `turn-${Date.now()}-${index}`,
      day: row.querySelector('.schedule-day').value,
      start: row.querySelector('.schedule-start').value,
      end: row.querySelector('.schedule-end').value,
      discipline: row.querySelector('.schedule-discipline').value.trim(),
      instructor: row.querySelector('.schedule-instructor').value.trim(),
      capacity: Number(row.querySelector('.schedule-capacity').value) || 10,
      enrolled: Number(row.dataset.enrolled) || 0,
      waitlist: row.dataset.waitlist !== 'false',
    }));
    const allowOverlaps = document.querySelector('#allow-overlaps').checked;
    for (const turn of turns) if (!turn.start || !turn.end || turn.start >= turn.end || !turn.discipline) {
      toast('Completá un horario válido y la disciplina de cada turno.');
      return;
    }
    if (!allowOverlaps) {
      for (const day of ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']) {
        const sameDay = turns.filter(turn => turn.day === day).sort((x,y) => x.start.localeCompare(y.start));
        for (let i=1;i<sameDay.length;i++) if (sameDay[i].start < sameDay[i-1].end) {
          toast(`Hay horarios superpuestos el día ${day}. Activá la opción para permitirlos.`);
          return;
        }
      }
    }
    await saveGymSchedule({ gymId: membership.gymId, turns, allowScheduleOverlaps: allowOverlaps, gymName: document.querySelector('#catalog-name').value, published: document.querySelector('#catalog-published').checked });
    toast('Horarios guardados.');
    render();
  }

  if (action === 'save-gym') { await updateGymProfile(membership.gymId, { name: document.querySelector('#gym-name').value.trim(), absenceNoticeHours: Number(document.querySelector('#absence-hours').value) }); toast('Configuración guardada.'); render(); }
  if (button.dataset.close !== undefined) modal.close();
});
render();
