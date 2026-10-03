export type Department={id:string;name:string;icon:string;prefix:string};
export type Ticket={ticketId:string;displayNumber:string;departmentName:string;peopleAhead:number;estimatedMinutes:number;claimUrl:string};
const demoDepartments:Department[]=[
{id:'MACELLERIA',name:'Macelleria',icon:'🥩',prefix:'M'},
{id:'SALUMERIA',name:'Salumeria',icon:'🧀',prefix:'S'},
{id:'PANETTERIA',name:'Panetteria',icon:'🥖',prefix:'P'},
{id:'PESCHERIA',name:'Pescheria',icon:'🐟',prefix:'PE'},
{id:'PASTICCERIA',name:'Pasticceria',icon:'🍰',prefix:'PA'},
];
let seq=41;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function departments(){await sleep(120);return demoDepartments;}
export async function createTicket(d:Department,channel:'paper'|'qr'){await sleep(180);seq++;return {ticketId:`demo-${d.id}-${seq}`,displayNumber:`${d.prefix}${String(seq).padStart(3,'0')}`,departmentName:d.name,peopleAhead:Math.max(1,seq%8),estimatedMinutes:6+(seq%7),claimUrl:`https://queue.example.com/claim/demo-${d.id}-${seq}`} satisfies Ticket;}
export async function createTapSession(d:Department){await sleep(150);return {tapSessionId:`tap-${Date.now()}`,expiresAt:new Date(Date.now()+25000).toISOString(),stationTapUrl:'https://queue.example.com/tap/TOTEM-001'};}
