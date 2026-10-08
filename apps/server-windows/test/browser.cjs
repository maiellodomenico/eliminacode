const {chromium}=require('playwright');
const {startServer}=require('../server.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
(async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ec-browser-'));
 const output=process.env.ELIMINACODE_TEST_OUTPUT||path.join(__dirname,'../test-output');fs.mkdirSync(output,{recursive:true});
 const info=await startServer({port:0,host:'127.0.0.1',dataDir});const base=`http://127.0.0.1:${info.port}`;
 const browser=await chromium.launch({headless:true});const contexts=[];const errors=[];
 async function page(width=1280,height=900){const ctx=await browser.newContext({viewport:{width,height}});contexts.push(ctx);const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);return p;}
 async function noOverflow(p){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'page has horizontal overflow: '+p.url());}
 try{
  const admin=await page();await admin.goto(base+'/admin');await admin.locator('#shopName').fill('Mercato Centrale');await admin.locator('#username').fill('direttore');await admin.locator('#password').fill('password-produzione-test');await admin.locator('#confirm').fill('password-produzione-test');await admin.getByRole('button',{name:'Crea e avvia',exact:true}).click();await admin.getByRole('heading',{name:'Panoramica',exact:true}).waitFor();
  await admin.getByRole('button',{name:'Configurazione',exact:true}).click();await admin.locator('#settingBase').fill(base);await admin.getByRole('button',{name:'Salva configurazione',exact:true}).click();await admin.locator('#notice').filter({hasText:'Operazione completata'}).waitFor();
  await admin.getByRole('button',{name:'Reparti',exact:true}).click();await admin.locator('#depName').fill('Gastronomia');await admin.locator('#depPrefix').fill('G');await admin.getByRole('button',{name:'Aggiungi reparto',exact:true}).click();await admin.locator('.deviceCard').filter({hasText:'Gastronomia'}).waitFor();
  async function role(type,departmentId){await admin.getByRole('button',{name:'Postazioni',exact:true}).click();await admin.locator('#deviceType').selectOption(type);await admin.locator('#deviceName').fill(type+' prova');if(departmentId)await admin.locator('#deviceDep').selectOption(departmentId);await admin.getByRole('button',{name:'Genera codice e QR',exact:true}).click();await admin.locator('#modal .code').waitFor();const code=(await admin.locator('#modal .code').textContent()).trim();await admin.getByRole('button',{name:'Chiudi',exact:true}).click();const p=await page(type==='operator'?820:1280,900);await p.goto(`${base}/${type}?code=${code}`);return p;}
  const totem=await role('totem');const operator=await role('operator','salumeria');const display=await role('display');
  await totem.locator('[data-dep="salumeria"]').click();const response=totem.waitForResponse(r=>r.url().endsWith('/api/tickets')&&r.request().method()==='POST');await totem.locator('#digital').click();const t=await (await response).json();assert.equal(t.number,'S001');await totem.locator('.number').filter({hasText:'S001'}).waitFor();assert.match(await totem.locator('img.qr').getAttribute('src'),/^data:image\/png;base64,/);
  const phone=await page(390,844);await phone.goto(t.claimUrl);await phone.locator('#number').filter({hasText:'S001'}).waitFor();await phone.locator('#order').fill('200 grammi prosciutto cotto');await phone.getByRole('button',{name:'Invia al banco',exact:true}).click();await operator.locator('.queueRow').filter({hasText:'200 grammi prosciutto cotto'}).waitFor();
  await operator.getByRole('button',{name:'Chiama prossimo',exact:true}).click();await display.locator('.number').filter({hasText:'S001'}).waitFor();await phone.locator('#call').waitFor({state:'visible'});await operator.getByRole('button',{name:'Richiama',exact:true}).click();await operator.getByRole('button',{name:'✓ Servito',exact:true}).click();await phone.locator('#feedback').waitFor({state:'visible'});await phone.getByRole('button',{name:'Bene',exact:true}).click();await phone.locator('#notice').filter({hasText:'Grazie per la tua valutazione'}).waitFor();
  await totem.getByRole('button',{name:'Ho finito',exact:true}).click();await totem.locator('[data-dep="macelleria"]').click();await totem.locator('#nfc').click();const tapUrl=await totem.locator('.linkbox').textContent();const tap=await page(390,844);await tap.goto(tapUrl);await tap.getByRole('button',{name:'Prendi il numero',exact:true}).click();await tap.locator('#number').filter({hasText:'M001'}).waitFor();
  await admin.getByRole('button',{name:'Panoramica',exact:true}).click();await admin.locator('.departments').waitFor();await noOverflow(admin);await admin.screenshot({path:path.join(output,'admin-desktop.png'),fullPage:true});
  await admin.setViewportSize({width:820,height:1000});await noOverflow(admin);await admin.screenshot({path:path.join(output,'admin-tablet.png'),fullPage:true});
  await admin.setViewportSize({width:390,height:844});await noOverflow(admin);await admin.screenshot({path:path.join(output,'admin-mobile.png'),fullPage:true});
  await noOverflow(phone);await phone.screenshot({path:path.join(output,'ticket-mobile.png'),fullPage:true});await noOverflow(operator);await operator.screenshot({path:path.join(output,'operator-tablet.png'),fullPage:true});
  await noOverflow(totem);await totem.screenshot({path:path.join(output,'totem-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[],'browser errors');console.log('PASS: actual browser setup, departments, pairing, ticket QR, phone order, operator call/recall/serve, display, feedback, NFC link and responsive layout.');
 }finally{for(const ctx of contexts)await ctx.close();await browser.close();await info.close();fs.rmSync(dataDir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
