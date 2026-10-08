const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const Database=require('better-sqlite3');const {startServer}=require('../server.cjs');const {estimateInterval}=require('../wait-times.cjs');
test('mean served intervals: department configuration, manual mode, pauses and fallback',()=>{
 const times=['2026-10-08T10:00:00Z','2026-10-08T10:02:00Z','2026-10-08T10:06:00Z','2026-10-08T12:00:00Z','2026-10-08T12:02:00Z'];
 assert.deepEqual(estimateInterval(times,{sample_size:20,max_gap_minutes:30}),{minutesPerCustomer:8/3,source:'auto',samples:3});
 assert.deepEqual(estimateInterval(times,{sample_size:1}),{minutesPerCustomer:2,source:'auto',samples:1});
 assert.deepEqual(estimateInterval(times,{wait_mode:'manual',manual_minutes:7}),{minutesPerCustomer:7,source:'manual',samples:0});
 assert.deepEqual(estimateInterval([new Date(2026,9,7,23,59).toISOString(),new Date(2026,9,8,0,1).toISOString()],{manual_minutes:4}),{minutesPerCustomer:4,source:'fallback',samples:0});
});
test('public gateway isolation, HTTPS QR, push authentication, dispatch and durable configuration',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ec-public-'));let info,cookie;const sent=[];
 try{info=await startServer({port:0,publicPort:0,dataDir,host:'127.0.0.1',pushSend:async(s,p)=>sent.push(JSON.parse(p))});const base=`http://127.0.0.1:${info.port}`,pub=`http://127.0.0.1:${info.publicPort}`;
 async function request(url,{method='GET',body,publicAccess=false,auth,expected=200,origin}={}){const headers={'Content-Type':'application/json'};if(!publicAccess&&cookie)headers.Cookie=cookie;if(auth){headers.Authorization='Bearer '+auth.deviceKey;headers['X-Device-Id']=auth.deviceId||'';}if(origin)headers.Origin=origin;const r=await fetch((publicAccess?pub:base)+url,{method,headers,body:body?JSON.stringify(body):undefined});assert.equal(r.status,expected,url);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r.headers.get('content-type')?.includes('json')?r.json():r;}
 const post=(u,b,o={})=>request(u,{method:'POST',body:b,...o});
 await post('/api/setup',{username:'test',password:'customer-test-password'});
 await request('/api/admin/settings',{method:'PUT',body:{publicBase:base,customerBase:'https://turni.example.test'}});
 for(const u of ['/admin','/api/admin/overview','/api/auth','/operator','/api/operator/queue','/api/display','/server.cjs'])await request(u,{publicAccess:true,expected:403});
 await post('/api/setup',{username:'attack',password:'attack-password'},{publicAccess:true,expected:403});await post('/api/pair',{code:'12345678',role:'totem'},{publicAccess:true,expected:403});
 assert.equal((await request('/api/customer/health',{publicAccess:true})).ok,true);
 await post('/api/admin/departments',{id:'salumeria',name:'Salumeria',prefix:'S',waitMode:'manual',manualMinutes:7,sampleSize:20,maxGapMinutes:30});
 const p=await post('/api/devices',{type:'totem'});assert.ok(p.pairingUrl.startsWith(base));const auth=await post('/api/pair',{code:p.pairingCode,role:'totem'});
 const t1=await post('/api/tickets',{departmentId:'salumeria',requestId:'public-ticket-1'},{auth});const t2=await post('/api/tickets',{departmentId:'salumeria',requestId:'public-ticket-2'},{auth});assert.ok(t1.claimUrl.startsWith('https://turni.example.test/'));assert.equal(t2.estimatedMinutes,7);assert.equal(t2.source,'manual');
 const token=new URL(t2.claimUrl).searchParams.get('token');await post('/api/claim',{ticketId:t2.ticketId,token},{publicAccess:true,origin:'https://evil.test',expected:403});
 await post('/api/claim',{ticketId:t2.ticketId,token},{publicAccess:true,origin:'https://turni.example.test'});
 const subscription={endpoint:'https://web.push.apple.com/test',keys:{p256dh:Buffer.alloc(65,4).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
 await post('/api/push/subscribe',{ticketId:t2.ticketId,token:'wrong',subscription},{publicAccess:true,expected:403});
 await post('/api/push/subscribe',{ticketId:t2.ticketId,token,subscription:{...subscription,endpoint:'https://127.0.0.1/private'}},{publicAccess:true,expected:400});
 await post('/api/push/subscribe',{ticketId:t2.ticketId,token,subscription},{publicAccess:true});
 await new Promise(r=>setTimeout(r,25));assert.equal(sent.length,1);assert.match(sent[0].body,/Manca un numero al tuo turno/);
 await post('/api/push/subscribe',{ticketId:t2.ticketId,token,subscription},{publicAccess:true});await new Promise(r=>setTimeout(r,25));assert.equal(sent.length,1,'duplicate subscribe must not repeat push');
 const opPair=await post('/api/devices',{type:'operator',departmentId:'salumeria'}),op=await post('/api/pair',{code:opPair.pairingCode,role:'operator'});
 await post('/api/operator/action',{action:'next'},{auth:op});await post('/api/operator/action',{action:'serve',ticketId:t1.ticketId},{auth:op});await post('/api/operator/action',{action:'next'},{auth:op});await new Promise(r=>setTimeout(r,25));assert.ok(sent.some(p=>p.body.includes('È il tuo turno')));
 const manifest=await request('/manifest.webmanifest?ticket='+t2.ticketId+'&token='+token,{publicAccess:true});assert.equal(manifest.display,'standalone');assert.ok(manifest.start_url.includes(token));await request('/sw.js',{publicAccess:true});
 const db=new Database(path.join(dataDir,'eliminacode.sqlite'));db.prepare("UPDATE tickets SET served_at='2026-10-08T10:00:00Z' WHERE id=?").run(t1.ticketId);db.close();
 const key=(await request('/api/push/config',{publicAccess:true})).publicKey;await info.close();info=await startServer({port:0,publicPort:0,dataDir,host:'127.0.0.1',pushSend:async()=>{}});assert.equal((await (await fetch(`http://127.0.0.1:${info.publicPort}/api/push/config`)).json()).publicKey,key);
 }finally{await info?.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
