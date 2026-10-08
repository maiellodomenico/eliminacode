'use strict';
// HTML media playback is started synchronously from the tap, before any awaited work.
class TicketAudio {
 constructor(player,onState){this.player=player;this.onState=onState;this.enabled=false;this.busy=false;
  player.addEventListener('error',()=>{this.enabled=false;onState('error','Suono non caricato. Ricarica la pagina e riprova.');});
  player.addEventListener('playing',()=>onState(this.enabled?'ready':'confirm','Riproduzione avviata. Se non senti il suono, alza il volume multimediale.'));
 }
 test(){this.enabled=false;this.player.pause();if(this.player.readyState>0)this.player.currentTime=0;
  let pending;try{pending=this.player.play();}catch(e){return this.failure(e);}
  return Promise.resolve(pending).then(()=>{this.onState('confirm','Senti il suono? Conferma qui sotto per attivare gli avvisi.');return true;},e=>this.failure(e));
 }
 confirm(){this.enabled=true;this.onState('ready','Avvisi sonori attivi mentre questa pagina è visibile.');}
 failure(e){this.enabled=false;this.onState('blocked','Audio non attivato. Premi ▶ nel lettore qui sotto, poi conferma che senti il suono.');return Promise.resolve(false);}
 async alert(){if(!this.enabled||document.hidden||this.busy)return false;this.busy=true;try{this.player.pause();if(this.player.readyState>0)this.player.currentTime=0;await this.player.play();return true;}catch(e){await this.failure(e);return false;}finally{this.busy=false;}}
 check(){if(this.enabled&&!document.hidden)this.onState('ready','Pagina riaperta: se l’audio si è interrotto, premi “Prova audio” per riattivarlo.');}
}
window.TicketAudio=TicketAudio;
