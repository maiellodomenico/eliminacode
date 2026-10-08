'use strict';
class TicketAudio {
 constructor(player,onState){this.player=player;this.onState=onState;this.enabled=false;this.busy=false;this.context=null;this.alertsPlayed=0;
  player.addEventListener('error',()=>{if(!this.context){this.enabled=false;onState('error','Suono non caricato. Ricarica la pagina e riprova.');}});
 }
 configureSession(){try{if(window.navigator?.audioSession)window.navigator.audioSession.type='playback';}catch{}}
 tone(){const c=this.context;if(c.state!=='running')throw new Error('Audio sospeso');const start=c.currentTime;
  for(let i=0;i<3;i++){const o=c.createOscillator(),g=c.createGain(),t=start+i*.4;o.type='sine';o.frequency.value=i===1?1174:880;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.35,t+.025);g.gain.setValueAtTime(.35,t+.23);g.gain.linearRampToValueAtTime(0,t+.32);o.connect(g);g.connect(c.destination);o.onended=()=>{o.disconnect();g.disconnect();};o.start(t);o.stop(t+.33);}
 }
 test(){this.enabled=false;this.configureSession();const C=window.AudioContext||window.webkitAudioContext;
  if(C){try{if(!this.context||this.context.state==='closed'){this.context=new C();this.context.addEventListener('statechange',()=>{if(this.enabled&&this.context.state!=='running'&&!document.hidden){this.enabled=false;this.onState('blocked','Audio interrotto da iPhone. Tocca “Prova audio” per riattivarlo.');}});}const pending=this.context.resume();return Promise.resolve(pending).then(()=>{this.tone();this.onState('confirm','Senti i tre segnali? Conferma qui sotto per attivare gli avvisi.');return true;},e=>this.failure(e)).catch(e=>this.failure(e));}catch(e){return this.failure(e);}}
  this.player.pause();if(this.player.readyState>0)this.player.currentTime=0;
  let pending;try{pending=this.player.play();}catch(e){return this.failure(e);}
  return Promise.resolve(pending).then(()=>{this.onState('confirm','Senti il suono? Conferma qui sotto per attivare gli avvisi.');return true;},e=>this.failure(e));
 }
 confirm(){this.enabled=true;this.onState('ready','Avvisi sonori attivi mentre questa pagina è visibile.');}
 failure(e){this.enabled=false;this.onState('blocked','Audio non attivato. Tocca di nuovo “Prova audio”, alza il volume e conferma che senti il suono.');return Promise.resolve(false);}
 async alert(){if(!this.enabled||document.hidden||this.busy)return false;this.busy=true;try{this.configureSession();if(this.context){this.tone();}else{this.player.pause();if(this.player.readyState>0)this.player.currentTime=0;await this.player.play();}this.alertsPlayed++;return true;}catch(e){await this.failure(e);return false;}finally{this.busy=false;}}
 check(){if(this.enabled&&!document.hidden){if(this.context&&this.context.state!=='running'){this.enabled=false;this.onState('blocked','Audio sospeso. Tocca “Prova audio” per riattivarlo.');}else this.onState('ready','Avvisi sonori attivi mentre questa pagina è visibile.');}}
}
window.TicketAudio=TicketAudio;
