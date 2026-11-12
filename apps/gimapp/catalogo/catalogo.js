import {getAbsenceNoticeHours} from '../panel/modulos/configuracion.js';
import {loadPublicCatalog,registerClientWithPassword,signInClientWithPassword,enrollClientInTurn,getMyClientProfile} from './firebase-client.js';
import {decorateHelp,showHelp} from '../panel/modulos/ayuda.js';

const panel=document.querySelector('#catalog-login'),host=document.querySelector('#catalog-forms'),privacy=document.querySelector('#privacy-dialog');
let currentClient=null,privacyAccepted=false,portalTab='turnos',publicCatalog=null,catalogLoadError='Cargando los datos publicados del gimnasio…';
const fields=`<label class="field">Correo electrónico<input name="email" type="email" required autocomplete="email"></label><label class="field password-field">Contraseña<span class="password-control"><input name="password" type="password" required autocomplete="new-password"><button class="password-toggle" type="button" data-password-toggle aria-label="Mostrar contraseña">Mostrar</button></span></label>`;
const todayLocal=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const weekdays=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
let demo={requests:[],waitlist:[],absences:[],recoveries:[],selected:[]};
function previewButton(){return publicCatalog?'<button class="button full" type="button" id="open-demo-portal">Ver horarios publicados</button>':'';}
function catalogStatus(){return publicCatalog?`<p class="notice" id="catalog-status">Catálogo de <b>${escapeHtml(publicCatalog.gymName||'Gimnasio')}</b>. Los horarios se publican desde la configuración del gimnasio. El registro y las inscripciones requieren habilitación del gimnasio.</p>`:`<p class="notice" id="catalog-status">${escapeHtml(catalogLoadError||'No se pudo cargar el catálogo publicado.')}</p>`;}
function publicTurns(){return Array.isArray(publicCatalog?.turns)?publicCatalog.turns.map(t=>({...t,capacity:Number(t.capacity)||0,enrolled:Number(t.enrolled)||0,waitlist:Boolean(t.waitlist)})).filter(t=>t.id&&t.day&&t.start&&t.end):[];}
function scheduleOptions(){const turns=publicTurns();if(!turns.length)return '<p class="notice">El gimnasio todavía no publicó turnos disponibles. No podés seleccionar horarios hasta que el dueño publique su configuración.</p>';return `<fieldset class="schedule-options"><legend>Días y horarios que querés solicitar</legend>${weekdays.map(day=>{const dayTurns=turns.filter(t=>t.day===day);return dayTurns.length?`<div class="schedule-day"><b>${day}</b>${dayTurns.map(t=>{const vacant=Math.max(0,t.capacity-t.enrolled),canSelect=vacant>0||t.waitlist;return `<label class="schedule-option ${canSelect?'':'unavailable'}"><input type="checkbox" name="schedule" value="${escapeHtml(t.id)}" ${canSelect?'':'disabled'}><span><strong>${escapeHtml(t.start)}–${escapeHtml(t.end)} · ${escapeHtml(t.discipline)}${t.instructor?` · ${escapeHtml(t.instructor)}`:''}</strong><small>${vacant>0?`${vacant} vacante${vacant===1?'':'s'}`:t.waitlist?'Completo · permite lista de espera':'Completo · sin vacantes'}</small></span></label>`;}).join('')}</div>`:'';}).join('')}</fieldset>`;}
function show(mode='login'){
 const create=mode==='create';privacyAccepted=false;panel.classList.remove('portal-mode');
 host.innerHTML=`${catalogStatus()}<h2>${create?'Crear una cuenta':'Iniciar sesión'}</h2><p class="muted small">${create?'Completá tus datos para crear tu cuenta. Después vas a poder elegir turnos disponibles.':'Ingresá con tu correo electrónico y contraseña.'}</p><form id="client-form">${create?`<div class="form-grid"><label class="field">Nombre<input name="first" required></label><label class="field">Apellido<input name="last" required></label></div><label class="field">Teléfono<input name="phone" type="tel" required></label><label class="field">Fecha de nacimiento<input name="birthDate" type="date" max="${todayLocal()}" required></label>`:`<label class="field">Correo electrónico<input name="identity" type="email" required autocomplete="username"></label>`}${fields}${create?`<button class="button full" type="button" id="open-privacy">Leer información de privacidad y consentir</button><p class="small muted" id="privacy-state">Todavía no aceptaste el consentimiento.</p><label class="consent"><input type="checkbox" name="truthful" required><span>Declaro que la información que proporcioné es completa, correcta y actualizada.</span></label><label class="consent"><input type="checkbox" name="adult" required><span>Declaro que tengo 18 años o más. GimAPP admite por ahora solo personas adultas.</span></label>`:''}<button class="button primary full" type="submit">${create?'Crear cuenta':'Ingresar'}</button></form><p class="form-message" aria-live="polite"></p><div id="demo-portal-link"></div><button class="text-link" id="mode-toggle">${create?'Ya tengo cuenta':'Crear una cuenta'} →</button>`;
 decorateHelp(host);decorateHelp(privacy);
 document.querySelector('#client-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget,message=host.querySelector('.form-message'),submit=form.querySelector('[type="submit"]');
  if(create&&!privacyAccepted){message.textContent='Leé y aceptá la información de privacidad.';return;}
  submit.disabled=true;message.textContent='Procesando…';
  try{
    if(create){
      await registerClientWithPassword({firstName:form.elements.first.value,lastName:form.elements.last.value,phone:form.elements.phone.value,birthDate:form.elements.birthDate.value,email:form.elements.email.value,password:form.elements.password.value});
    }else{
      await signInClientWithPassword({email:form.elements.identity.value,password:form.elements.password.value});
    }
    currentClient=await getMyClientProfile();
    await refreshPublicCatalog();
    showPortal();
  }catch(error){message.textContent=error?.message||'No se pudo completar la operación.';}
  finally{submit.disabled=false;}
 });
 document.querySelector('#mode-toggle').onclick=()=>show(create?'login':'create');
 if(create)document.querySelector('#open-privacy').onclick=()=>{privacy.querySelector('#privacy-accept').checked=false;privacy.querySelector('#privacy-confirm').disabled=true;privacy.showModal();};
 host.querySelector('[data-password-toggle]').addEventListener('click',e=>{const input=host.querySelector('input[name="password"]'),visible=input.type==='password';input.type=visible?'text':'password';e.currentTarget.textContent=visible?'Ocultar':'Mostrar';e.currentTarget.setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');});
}
function portalContent(){
 const turns=publicTurns();
 if(portalTab==='turnos')return `<h3>Turnos publicados</h3><p>Elegí un horario con vacantes para anotarte automáticamente.</p>${weekdays.map(day=>{const items=turns.filter(t=>t.day===day);return items.length?`<section class="portal-day"><h4>${day}</h4>${items.map(t=>{const vacant=Math.max(0,t.capacity-t.enrolled),assigned=(currentClient?.assignedTurnIds||[]).includes(t.id);return `<article class="portal-item"><div><b>${escapeHtml(t.start)}–${escapeHtml(t.end)} · ${escapeHtml(t.discipline)}</b><small>${vacant} vacantes</small></div>${assigned?'<span class="status">Anotado</span>':vacant>0?`<button class="button small primary" data-portal="enroll" data-id="${escapeHtml(t.id)}">Anotarme</button>`:'<span class="status">Completo</span>'}</article>`;}).join('')}</section>`:'';}).join('')}`;
 if(portalTab==='solicitudes')return `<h3>Mis solicitudes</h3>${demo.requests.length?demo.requests.map(x=>`<p class="portal-item">${escapeHtml(x.label)} <span class="status pending">Pendiente de revisión</span></p>`).join(''):'<div class="empty">No hay solicitudes en esta vista de demostración.</div>'}`;
 if(portalTab==='espera')return `<h3>Lista de espera</h3><p>Las solicitudes no vencen y quedan ordenadas por fecha de inscripción.</p>${demo.waitlist.length?[...demo.waitlist].sort((a,b)=>a.when.localeCompare(b.when)).map(x=>`<p class="portal-item">${escapeHtml(x.label)}<small>Anotación: ${new Date(x.when).toLocaleString('es-AR')}</small></p>`).join(''):'<div class="empty">Todavía no te anotaste en una lista de espera.</div>'}`;
 if(portalTab==='ausencias')return `<h3>Ausencias y recuperaciones</h3><div class="notice">Avisá con al menos ${getAbsenceNoticeHours()} horas de anticipación para conservar el derecho a solicitar recuperación. El aviso siempre libera el lugar. Si el plazo se venció, no corresponde recuperación.</div><label class="field">Turno asignado<select class="select" id="absence-turn">${turns.map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml(t.day)} ${escapeHtml(t.start)} · ${escapeHtml(t.discipline)}</option>`).join('')}</select></label><label class="field">Fecha del turno<input id="absence-date" type="date" value="${todayLocal()}"></label><label class="field">Avisar ausencia y solicitar recuperación<select class="select" id="absence-recovery"><option value="no">Solo avisar ausencia</option><option value="si">Avisar y solicitar recuperación</option></select></label><button class="button primary" data-portal="absence">Enviar aviso</button>${demo.absences.map(x=>`<p class="portal-item">Ausencia: ${escapeHtml(x.label)} · ${x.recovery?'recuperación solicitada':'sin recuperación'}<small>${x.status}</small></p>`).join('')}${demo.recoveries.map(x=>`<div class="portal-item"><div><b>Recuperación pendiente</b><small>${escapeHtml(x.label)} · disponible hasta ${escapeHtml(x.deadline)}</small></div>${x.selected?'Turno propuesto: '+escapeHtml(x.selected):`<select class="select" data-recovery-choice="${x.id}"><option value="">Elegir turno con vacante</option>${turns.filter(t=>t.capacity>t.enrolled).map(t=>`<option>${escapeHtml(t.day)} ${escapeHtml(t.start)} · ${escapeHtml(t.discipline)} (${t.capacity-t.enrolled} vacantes)</option>`).join('')}</select><button class="button small" data-portal="choose-recovery" data-id="${x.id}">Solicitar este turno</button>`}</div>`).join('')}<p class="notice">WhatsApp no está conectado y esta vista no envía avisos reales.</p>`;
 return `<h3>Pagos</h3><p>Estado de cuota: sin verificar en esta demostración.</p><div class="portal-item"><b>Mercado Pago</b><button class="button" disabled>Próximamente</button></div><p class="notice">No hay cobros conectados. Los pagos y medios electrónicos no se procesan desde esta pantalla.</p>`;
}
async function refreshPublicCatalog(){publicCatalog=await loadPublicCatalog();}
function showPortal(){if(!publicCatalog){alert(catalogLoadError||'No se pudo cargar el catálogo publicado.');return;}panel.classList.add('portal-mode');portalTab='turnos';paintPortal();}
function paintPortal(){host.innerHTML=`<div class="portal-head"><div><span class="status pending">PORTAL DEL CLIENTE</span><h2>${escapeHtml(publicCatalog?.gymName||'Portal del cliente')}</h2></div><button class="text-link" data-portal="exit">Salir de la vista</button></div><p class="notice">Los horarios e inscripciones se guardan en Firebase. Lista de espera, ausencias, recuperaciones y pagos todavía no están habilitados.</p><nav class="portal-nav">${[['turnos','Turnos'],['solicitudes','Solicitudes'],['espera','Lista de espera'],['ausencias','Ausencias / recuperación'],['pagos','Pagos']].map(([id,label])=>`<button class="button small ${portalTab===id?'primary':''}" data-tab="${id}">${label}</button>`).join('')}</nav><div class="portal-content">${portalContent()}</div>`;decorateHelp(host);}
host.addEventListener('click',e=>{
 const help=e.target.closest('[data-help]');if(help){e.preventDefault();e.stopPropagation();showHelp(help.dataset.help);return;}
 const tab=e.target.closest('[data-tab]');if(tab){portalTab=tab.dataset.tab;paintPortal();return;}
 const button=e.target.closest('[data-portal]');if(!button)return;const action=button.dataset.portal;
 if(action==='enroll'){button.disabled=true;try{await enrollClientInTurn({turnId:button.dataset.id});currentClient=await getMyClientProfile();await refreshPublicCatalog();paintPortal();}catch(error){alert(error?.message||'No se pudo reservar la vacante.');button.disabled=false;}return;}
 if(action==='exit'){panel.classList.remove('portal-mode');show();return;}
 if(action==='waitlist'){const t=publicTurns().find(x=>x.id===button.dataset.id);if(t&&!demo.waitlist.some(x=>x.id===t.id))demo.waitlist.push({id:t.id,label:`${t.day} ${t.start} · ${t.discipline}`,when:new Date().toISOString()});portalTab='espera';paintPortal();return;}
 if(action==='request'){const selected=demo.selected.map(id=>publicTurns().find(t=>t.id===id)).filter(t=>t&&t.enrolled<t.capacity);if(selected.length)demo.requests.push({label:selected.map(t=>`${t.day} ${t.start}`).join(', ')});demo.selected=[];portalTab='solicitudes';paintPortal();return;}
 if(action==='choose-recovery'){const recovery=demo.recoveries.find(x=>x.id===button.dataset.id),choice=document.querySelector(`[data-recovery-choice="${button.dataset.id}"]`)?.value;if(!recovery||!choice){alert('Elegí una vacante para solicitar la recuperación.');return;}recovery.selected=choice;paintPortal();return;}
 if(action==='absence'){const id=document.querySelector('#absence-turn')?.value,t=publicTurns().find(x=>x.id===id),date=document.querySelector('#absence-date')?.value,wants=document.querySelector('#absence-recovery')?.value==='si';if(!t||!date){alert('Seleccioná el turno y la fecha.');return;}const start=new Date(`${date}T${t.start}:00`),hours=(start-Date.now())/3600000,eligible=hours>=getAbsenceNoticeHours(),label=`${t.day} ${t.start} · ${date}`;/* Las vacantes publicadas son de solo lectura en esta vista; el aviso no modifica Firebase. */demo.absences.push({label,recovery:wants&&eligible,status:wants&&!eligible?'Fuera del plazo; sin recuperación':'Aviso registrado en demo'});if(wants&&eligible){const end=new Date(`${date.slice(0,7)}-01T12:00:00`);end.setMonth(end.getMonth()+1);end.setDate(0);demo.recoveries.push({id:`recovery-${Date.now()}`,label,deadline:end.toLocaleDateString('es-AR')});}paintPortal();}
});
host.addEventListener('change',e=>{if(e.target.matches('[data-select-turn]')){const id=e.target.dataset.selectTurn;demo.selected=e.target.checked?[...new Set([...demo.selected,id])]:demo.selected.filter(x=>x!==id);}});
privacy.querySelector('#privacy-accept').addEventListener('change',e=>privacy.querySelector('#privacy-confirm').disabled=!e.target.checked);
privacy.querySelector('#privacy-confirm').addEventListener('click',()=>{privacyAccepted=true;privacy.close();const state=host.querySelector('#privacy-state');if(state)state.textContent='Consentimiento aceptado. La cuenta se creará únicamente si el gimnasio habilitó el registro.';});
privacy.querySelector('#privacy-cancel').addEventListener('click',()=>privacy.close());privacy.querySelector('#privacy-close').addEventListener('click',()=>privacy.close());
async function initializePublicCatalog(){
 try{
  publicCatalog=await loadPublicCatalog();
  catalogLoadError='';
  const title=document.querySelector('.catalog-hero .eyebrow');
  if(title)title.textContent=`${publicCatalog.gymName||'GIMNASIO'} · CATÁLOGO`.toLocaleUpperCase('es-AR');
  document.title=`GimAPP | ${publicCatalog.gymName||'Catálogo'}`;
 }catch(error){
  publicCatalog=null;
  catalogLoadError=error?.message||'No se pudo cargar el catálogo publicado.';
  const title=document.querySelector('.catalog-hero .eyebrow');
  if(title)title.textContent='CATÁLOGO NO DISPONIBLE';
 }
}
initializePublicCatalog().finally(()=>setTimeout(()=>{panel.classList.add('show');show();},5000));
decorateHelp(document.querySelector('.catalog-hero'));document.addEventListener('click',e=>{const help=e.target.closest('[data-help]');if(help){e.preventDefault();e.stopPropagation();showHelp(help.dataset.help);}});
