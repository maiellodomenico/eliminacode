export type Ticket={ticketId:string;displayNumber:string;departmentName:string;currentNumber:string;peopleAhead:number;estimatedMinutes:number;status:'WAITING'|'CALLED'|'SERVED'};
let active:Ticket|null=null;
export async function claimFromUrl(url:string){const id=url.split('/').filter(Boolean).pop()||'demo';active={ticketId:id,displayNumber:'S042',departmentName:'Salumeria',currentNumber:'S036',peopleAhead:6,estimatedMinutes:12,status:'WAITING'};return active}
export async function getActiveTicket(){return active}
export async function saveOrder(_ticketId:string,items:string){return {ok:true,items}}
export async function sendFeedback(_ticketId:string,rating:'poor'|'average'|'good'){return {ok:true,rating}}
