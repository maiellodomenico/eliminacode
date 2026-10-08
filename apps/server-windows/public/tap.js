'use strict';
$('app').innerHTML='<section class="card login center"><div class="brand">ELIMINACODE</div><h1>Prendi il tuo turno</h1><p>Prima seleziona il reparto sul totem, poi conferma qui.</p><button id="take" class="primary">Prendi il numero</button></section>';
$('take').onclick=async()=>{const b=$('take');b.disabled=true;try{const ticket=await api('/api/tap/claim','POST',{deviceId:new URLSearchParams(location.search).get('device')});location.replace(ticket.claimUrl.replace(new URL(ticket.claimUrl).origin,location.origin));}catch(e){notice(e.message,true);b.disabled=false;}};
