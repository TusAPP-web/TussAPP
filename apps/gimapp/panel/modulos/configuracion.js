export const DEMO_GYM={name:'Gimnasio Norte',plan:'Demo',absenceNoticeHours:12,automaticVacancy:false,sessionMinutes:60};
const CATALOG_TURNS_KEY='gimapp-demo-catalog-turns-v1';
const ABSENCE_NOTICE_KEY='gimapp-demo-absence-notice-hours';
export const DEFAULT_CATALOG_TURNS=[
 {id:'mon-17',day:'Lunes',start:'17:00',end:'18:00',discipline:'Funcional',duration:60,capacity:5,enrolled:4,waitlist:true},
 {id:'mon-1830',day:'Lunes',start:'18:30',end:'19:30',discipline:'Funcional',duration:60,capacity:5,enrolled:5,waitlist:true},
 {id:'mon-20',day:'Lunes',start:'20:00',end:'21:00',discipline:'Fuerza',duration:60,capacity:5,enrolled:5,waitlist:false},
 {id:'tue-17',day:'Martes',start:'17:00',end:'18:00',discipline:'Funcional',duration:60,capacity:5,enrolled:3,waitlist:true},
 {id:'tue-1830',day:'Martes',start:'18:30',end:'19:30',discipline:'Pilates',duration:60,capacity:5,enrolled:4,waitlist:true},
 {id:'tue-20',day:'Martes',start:'20:00',end:'21:00',discipline:'Fuerza',duration:60,capacity:6,enrolled:6,waitlist:false},
 {id:'wed-17',day:'Miércoles',start:'17:00',end:'18:00',discipline:'Funcional',duration:60,capacity:5,enrolled:5,waitlist:true},
 {id:'wed-1830',day:'Miércoles',start:'18:30',end:'19:30',discipline:'Pilates',duration:60,capacity:5,enrolled:5,waitlist:false},
 {id:'wed-20',day:'Miércoles',start:'20:00',end:'21:00',discipline:'Fuerza',duration:60,capacity:5,enrolled:5,waitlist:false}
];
export function getCatalogTurns(){try{const value=JSON.parse(localStorage.getItem(CATALOG_TURNS_KEY)||'null');return Array.isArray(value)?value:structuredClone(DEFAULT_CATALOG_TURNS);}catch{return structuredClone(DEFAULT_CATALOG_TURNS);}}
export function saveCatalogTurn(turn){const turns=getCatalogTurns(),index=turns.findIndex(x=>x.id===turn.id);if(index<0)turns.push(turn);else turns[index]={...turns[index],...turn};try{localStorage.setItem(CATALOG_TURNS_KEY,JSON.stringify(turns));return true;}catch{return false;}}
export function getAbsenceNoticeHours(){try{const value=Number(localStorage.getItem(ABSENCE_NOTICE_KEY));return Number.isFinite(value)&&value>=0?value:DEMO_GYM.absenceNoticeHours;}catch{return DEMO_GYM.absenceNoticeHours;}}
export function saveAbsenceNoticeHours(hours){const value=Number(hours);if(!Number.isFinite(value)||value<0)return false;try{localStorage.setItem(ABSENCE_NOTICE_KEY,String(value));return true;}catch{return false;}}
