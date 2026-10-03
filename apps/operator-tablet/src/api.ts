export type QueueItem={ticketId:string;number:string;hasOrder:boolean;order?:string;status:'WAITING'|'CALLED'};
let q:QueueItem[]=[{ticketId:'1',number:'S041',hasOrder:false,status:'WAITING'},{ticketId:'2',number:'S042',hasOrder:true,order:'200 g prosciutto crudo\n300 g mortadella\nNota: affettare sottile',status:'WAITING'},{ticketId:'3',number:'S043',hasOrder:false,status:'WAITING'},{ticketId:'4',number:'S044',hasOrder:true,order:'500 g mozzarella',status:'WAITING'}];
export async function queue(){return [...q]}
export async function action(id:string,a:'call'|'serve'|'skip'|'recall'){if(a==='serve'||a==='skip')q=q.filter(x=>x.ticketId!==id);else q=q.map(x=>x.ticketId===id?{...x,status:'CALLED'}:x);return queue()}
