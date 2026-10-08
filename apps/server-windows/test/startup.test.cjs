const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {startServer}=require('../server.cjs');

test('authenticated local suite: pairing, FIFO, digital claim, service, feedback, backup and restart',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ec-test-'));let info,cookie='';
 const occupied=http.createServer();await new Promise(r=>occupied.listen(0,'127.0.0.1',r));const port=occupied.address().port;
 try{
  await assert.rejects(startServer({port,host:'127.0.0.1',dataDir}),{code:'EADDRINUSE'});
  await new Promise(r=>occupied.close(r));
  info=await startServer({port,host:'127.0.0.1',dataDir});const base=`http://127.0.0.1:${port}`;
  async function request(url,{method='GET',body,auth,admin=false,expected=200}={}){
   const headers={'Connection':'close','Content-Type':'application/json'};if(admin)headers.Cookie=cookie;
   if(auth){headers.Authorization='Bearer '+auth.deviceKey;headers['X-Device-Id']=auth.deviceId;}
   const r=await fetch(base+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
   assert.equal(r.status,expected,url+' status');
   const c=r.headers.get('set-cookie');if(c)cookie=c.split(';')[0];
   return r.headers.get('content-type')?.includes('application/json')?r.json():r;
  }
  const post=(url,body,opts={})=>request(url,{method:'POST',body,...opts});
  assert.equal((await request('/api/health')).configured,false);
  await request('/api/admin/overview',{expected:401});await post('/api/devices',{type:'operator'},{expected:401});
  await post('/api/setup',{username:'owner',password:'too-short'},{expected:400});
  await post('/api/setup',{username:'owner',password:'a-secure-password',shopName:'Negozio <prova>'});
  await post('/api/setup',{username:'owner',password:'a-secure-password'},{expected:409});
  await request('/api/admin/settings',{method:'PUT',body:{publicBase:base},admin:true});
  const overview=await request('/api/admin/overview',{admin:true});assert.equal(overview.departments.length,5);
  for(const route of ['/admin','/totem','/operator','/display','/claim','/tap'])assert.equal((await request(route)).status,200);
  const paired=async(type,departmentId)=>{
   const p=await post('/api/devices',{type,name:type,departmentId},{admin:true});
   const a=await post('/api/pair',{code:p.pairingCode,role:type});
   await post('/api/pair',{code:p.pairingCode,role:type},{expected:403});return a;
  };
  const totem=await paired('totem'),op=await paired('operator','salumeria'),other=await paired('operator','macelleria');
  await post('/api/tickets',{departmentId:'salumeria',requestId:'invalid-auth'},{expected:401});
  const issue=(id,departmentId='salumeria')=>post('/api/tickets',{departmentId,requestId:id},{auth:totem});
  const first=await issue('request-0001');assert.equal(first.number,'S001');assert.equal(first.peopleAhead,0);assert.match(first.qrDataUrl,/^data:image\/png;base64,/);assert.ok(first.claimUrl.startsWith(base));
  const retry=await issue('request-0001');assert.equal(retry.ticketId,first.ticketId);
  const many=await Promise.all([issue('request-0002'),issue('request-0003'),issue('request-0004')]);assert.equal(new Set(many.map(x=>x.number)).size,3);
  const parts=new URL(first.claimUrl).searchParams;const raw=parts.get('token');
  await request('/api/tickets/'+first.ticketId,{expected:403});
  await post('/api/claim',{ticketId:first.ticketId,token:'wrong'},{expected:403});
  const digital=await post('/api/claim',{ticketId:first.ticketId,token:raw});assert.equal(digital.digital,true);assert.equal(digital.number,'S001');
  await post('/api/order',{ticketId:first.ticketId,token:raw,notes:'200g prosciutto'});
  let queue=await request('/api/operator/queue',{auth:op});assert.equal(queue.length,4);assert.equal(queue[0].order,'200g prosciutto');
  await post('/api/operator/action',{action:'call',ticketId:many[1].ticketId},{auth:op,expected:409});
  await post('/api/operator/action',{action:'call',ticketId:first.ticketId},{auth:other,expected:403});
  await post('/api/operator/action',{action:'serve',ticketId:first.ticketId},{auth:op,expected:409});
  await post('/api/operator/action',{action:'next'},{auth:op});
  await post('/api/operator/action',{action:'next'},{auth:op,expected:409});
  assert.equal((await request('/api/display'))[0].number,'S001');
  const claimed=await request('/api/tickets/'+first.ticketId,{auth:{deviceKey:raw,deviceId:''}});assert.equal(claimed.status,'called');
  await post('/api/operator/action',{action:'recall',ticketId:first.ticketId},{auth:op});
  await post('/api/operator/action',{action:'serve',ticketId:first.ticketId},{auth:op});
  await post('/api/operator/action',{action:'recall',ticketId:first.ticketId},{auth:op,expected:409});
  await post('/api/feedback',{ticketId:first.ticketId,token:raw,rating:'good'});
  await post('/api/feedback',{ticketId:first.ticketId,token:raw,rating:'good'},{expected:409});
  await post('/api/tap',{departmentId:'macelleria'},{auth:totem});
  const nfc=await post('/api/tap/claim',{deviceId:totem.deviceId});assert.equal(nfc.number,'M001');
  await post('/api/tap/claim',{deviceId:totem.deviceId},{expected:410});
  const backup=await request('/api/admin/backup',{admin:true});assert.match(backup.headers.get('content-disposition'),/attachment/);assert.ok((await backup.arrayBuffer()).byteLength>4096);
  await info.close();info=await startServer({port,host:'127.0.0.1',dataDir});
  queue=await request('/api/operator/queue',{auth:op});assert.equal(queue.length,3);
  assert.equal((await issue('request-0005')).number,'S005');
  await post('/api/admin/devices/'+op.deviceId+'/revoke',{}, {admin:true});
  await request('/api/operator/queue',{auth:op,expected:401});
  await post('/api/logout',{}, {admin:true});await request('/api/admin/overview',{admin:true,expected:401});
  await post('/api/login',{username:'owner',password:'wrong-password'},{expected:401});await post('/api/login',{username:'owner',password:'a-secure-password'});
  assert.equal((await request('/api/auth',{admin:true})).authenticated,true);
 }finally{if(occupied.listening)await new Promise(r=>occupied.close(r));if(info)await info.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
