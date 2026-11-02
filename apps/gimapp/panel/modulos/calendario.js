import {dateKey} from './utilidades.js';
export function buildMonth(year,month){const first=new Date(year,month,1), mondayOffset=(first.getDay()+6)%7,start=new Date(year,month,1-mondayOffset);return Array.from({length:35},(_,i)=>{const date=new Date(start);date.setDate(start.getDate()+i);return {date,key:dateKey(date),outside:date.getMonth()!==month};});}
