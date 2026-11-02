// Turnos y listas ficticias del prototipo; las marcas se conservan en memoria.
const names=[
  {id:'GA-1042',name:'Lucía Fernández'},
  {id:'GA-1038',name:'Tomás Ríos'},
  {id:'GA-1021',name:'Martina López'},
  {id:'GA-0998',name:'Santiago Pérez'}
];
const roster=ids=>ids.map(id=>({...names.find(c=>c.id===id),state:''}));
const monday=[
  {id:'08-09',start:'08:00',end:'09:00',discipline:'Funcional',capacity:5,attendees:roster(['GA-1042','GA-1038','GA-1021','GA-0998'])},
  {id:'0930-1030',start:'09:30',end:'10:30',discipline:'Pilates',capacity:5,attendees:roster(['GA-1042','GA-1021','GA-0998'])},
  {id:'17-18',start:'17:00',end:'18:00',discipline:'Fuerza',capacity:6,attendees:roster(['GA-1038','GA-1021','GA-0998','GA-1042'])},
  {id:'19-20',start:'19:00',end:'20:00',discipline:'Funcional',capacity:6,attendees:roster(['GA-1042','GA-1038','GA-0998','GA-1021'])}
];
const byDate={'2026-11-02':monday};
export function getTurns(date){if(!byDate[date])byDate[date]=monday.map(t=>({...t,attendees:t.attendees.map(c=>({...c,state:''}))}));return byDate[date];}
export function setAttendance(date,turnId,clientId,state){const turn=getTurns(date).find(t=>t.id===turnId);const client=turn?.attendees.find(c=>c.id===clientId);if(client)client.state=client.state===state?'':state;}
export function getAttendanceHistory(clientId){return Object.entries(byDate).flatMap(([date,turns])=>turns.flatMap(turn=>turn.attendees.filter(c=>c.id===clientId&&c.state).map(c=>({date,time:`${turn.start}–${turn.end}`,discipline:turn.discipline,state:c.state}))));}
