/* UI/native contract checks. Fixtures below are TEST ONLY, not real Bluetooth devices. */
'use strict';
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),ASSETS=path.join(ROOT,'app/src/main/assets'),QA=path.join(ROOT,'build/qa');
const BASE=process.env.RACCOON_TEST_BASE||'https://appassets.androidplatform.net/assets/';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:393,height:851},acceptDownloads:true});
 await context.route('**/*',async r=>{const u=new URL(r.request().url()),n=u.pathname.replace(/^\/assets\//,'');if(u.origin!==new URL(BASE).origin||!n.match(/^[a-zA-Z0-9._-]+$/)||!fs.existsSync(path.join(ASSETS,n)))return r.abort();const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png'};return r.fulfill({status:200,contentType:types[path.extname(n)]||'text/plain',body:fs.readFileSync(path.join(ASSETS,n))});});
 await context.addInitScript(()=>{window.__calls=[];window.Android={getReport:()=>'{"connection":{"connected":false}}',getKnownDevices:()=>'{"devices":[],"state":"idle"}',refreshKnownDevices:()=>__calls.push(['known']),startScan:()=>__calls.push(['scan']),stopScan:()=>{},connect:id=>__calls.push(['connect',id]),disconnect:()=>{},installBackground:p=>__calls.push(['send',p]),exportFile:()=>{},importImage:()=>{}};});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'studio.html');await p.waitForFunction(()=>window.ImageStudio&&RaccoonFace.portrait.complete);await p.waitForTimeout(300);
 const fixture=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=960;c.height=240;const x=c.getContext('2d');x.fillStyle='#112233';x.fillRect(0,0,960,240);x.fillStyle='#f2af54';x.fillRect(700,25,180,190);return c.toDataURL('image/png');});
 await p.evaluate(async url=>{await ImageStudio.setSource({kind:'image',name:'TEST panorama',dataUrl:url});},fixture);
 let o=await p.evaluate(()=>ImageStudio.getOptions());assert.notEqual(o.mode,'stretch');assert.ok(['cover','blur'].includes(o.mode));assert.equal(await p.evaluate(()=>ImageStudio.getSource().dataUrl),fixture);
 await p.selectOption('#smartStrategy','preserve');o=await p.evaluate(()=>ImageStudio.getOptions());assert.equal(o.mode,'blur');assert.ok(Math.hypot(o.zoom,o.zoom/4)<=1);assert.equal(o.rotation,0);
 const before=await p.evaluate(()=>ImageStudio.getOptions());await p.evaluate(()=>ImageStudio.update({zoom:2,rotation:35}));await p.click('#smartFit');assert.equal(await p.evaluate(()=>ImageStudio.getOptions().rotation),0);await p.click('#undo');await p.waitForFunction(()=>ImageStudio.getOptions().rotation===35);await p.click('#redo');await p.waitForFunction(()=>ImageStudio.getOptions().rotation===0);
 await p.uncheck('#autoFitOnImport');await p.evaluate(async url=>ImageStudio.setSource({kind:'image',name:'TEST untouched',dataUrl:url}),fixture);assert.equal(await p.evaluate(()=>ImageStudio.getOptions().zoom),1);await p.check('#autoFitOnImport');
 await p.evaluate(()=>ImageStudio.go('device'));assert.ok((await p.evaluate(()=>__calls)).some(x=>x[0]==='known'));
 await p.evaluate(()=>onNativeEvent('knownDevices',{state:'complete',message:'TEST ONLY',devices:[{id:'AA:00:00:00:00:01',name:'TEST Headphones',audioConnected:true,systemConnected:true,classicOnly:true},{id:'AA:00:00:00:00:02',name:'TEST Watch 8 Ultra',bleConnected:true,systemConnected:true,paired:true,candidate:true},{id:'AA:00:00:00:00:03',name:'TEST Watch Calls',callsConnected:true,systemConnected:true,classicOnly:true}]}));
 assert.equal(await p.locator('#devices .device-row').count(),3);assert.ok((await p.locator('#devices .device-row').first().innerText()).includes('Watch 8 Ultra'));
 assert.equal(await p.locator('#nativeSend').isDisabled(),true);assert.equal((await p.evaluate(()=>__calls)).filter(x=>x[0]==='connect').length,0);
 assert.ok(!(await p.locator('#devices').innerText()).includes('undefined'));
 await p.evaluate(()=>onNativeEvent('devices',{scanning:false,devices:[{id:'AA:00:00:00:00:02',name:'TEST Watch 8 Ultra',rssi:-55,connectable:true}]}));assert.equal(await p.locator('#devices .device-row').count(),3);
 await p.locator('#devices .device-row').first().locator('button').click();assert.deepEqual((await p.evaluate(()=>__calls)).find(x=>x[0]==='connect'),['connect','AA:00:00:00:00:02']);
 await p.evaluate(()=>onNativeEvent('connected',{state:'connected'}));assert.equal(await p.locator('#nativeSend').isDisabled(),true);
 await p.evaluate(()=>onNativeEvent('capabilities',{ready:true,transferEnabled:true,screenWidth:454,screenHeight:454,message:'TEST ONLY'}));assert.equal(await p.evaluate(()=>ImageStudio.getOptions().width),454);
 await p.evaluate(()=>ImageStudio.go('editor'));await p.screenshot({path:path.join(QA,'smart-fit-2.2.png'),fullPage:true});
 for(const width of [320,360,393,700,1024]){await p.setViewportSize({width,height:851});for(const tab of ['editor','device']){await p.evaluate(t=>ImageStudio.go(t),tab);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width} ${tab}`);}}
 await p.setViewportSize({width:393,height:851});await p.screenshot({path:path.join(QA,'connected-devices-test-only.png'),fullPage:true});assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(QA,'connected-smart-tests.json'),JSON.stringify({version:'2.3.0',passed:['automatic fit without stretch','original preserved','inscribed circle safety','undo redo','auto off switch','Android catalog bridge','connected is not compatible','deduplication','user-select only','confirmed resolution','responsive layouts'],hardwareTested:false,androidRuntimeTested:false,fixtures:'TEST ONLY',errors},null,2));console.log('Connected device and smart-fit UI contracts passed. No hardware test.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
