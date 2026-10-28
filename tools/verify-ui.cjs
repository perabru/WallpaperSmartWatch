/* Verificação da interface em Chromium; não simula um teste de rádio Bluetooth. */
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),ASSETS=path.join(ROOT,'app/src/main/assets');
const OUT=process.env.RACCOON_OUTPUT||path.join(ROOT,'build/examples');
const QA=path.join(ROOT,'build/qa');fs.mkdirSync(QA,{recursive:true});fs.mkdirSync(OUT,{recursive:true});
const BASE=process.env.RACCOON_TEST_BASE||'https://appassets.androidplatform.net/assets/';
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({viewport:{width:402,height:874},deviceScaleFactor:2,acceptDownloads:true});
  await ctx.route('**/*',async route=>{const url=new URL(route.request().url());const name=url.pathname.replace(/^\/assets\//,'');if(url.origin!==new URL(BASE).origin||!['index.html','styles.css','face.js','app.js','jill-portrait.png'].includes(name)){return route.abort();}const ext=path.extname(name),types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png'};await route.fulfill({status:200,contentType:types[ext],body:fs.readFileSync(path.join(ASSETS,name))});});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'index.html');await page.waitForFunction(()=>RaccoonFace.portrait.complete&&RaccoonFace.portrait.naturalWidth>0);
  await page.screenshot({path:path.join(QA,'home.png'),fullPage:true});
  const outputs=await page.evaluate(()=>{
    const cfg=RaccoonFace.DEFAULT;
    const c=document.createElement('canvas');c.width=1024;c.height=1024;RaccoonFace.draw(c,cfg,{date:new Date(2026,9,28,9,52,18)});
    const preview=c.toDataURL('image/png');
    const round=RaccoonFace.exportPng({...cfg,width:1024,height:1024},true);
    const rect=RaccoonFace.exportPng({...cfg,shape:'rounded',width:512,height:627},true);
    c.width=512;c.height=627;RaccoonFace.draw(c,{...cfg,shape:'rounded'},{date:new Date(2026,9,28,9,52,18)});
    return {preview,round,rect,rectPreview:c.toDataURL('image/png')};
  });
  for(const [key,name] of [['preview','Raccoon-Inventory-previa.png'],['round','Raccoon-Inventory-fundo-redondo.png'],['rect','Raccoon-Inventory-fundo-retangular.png'],['rectPreview','Raccoon-Inventory-previa-retangular.png']])fs.writeFileSync(path.join(OUT,name),Buffer.from(outputs[key].split(',')[1],'base64'));
  await page.click('#editFace');await page.fill('#faceName','Raccoon • Bruno');await page.locator('#faceName').blur();await page.click('[data-accent="#59deff"]');await page.click('[data-shape="rounded"]');await page.selectOption('#dateLocale','pt');await page.uncheck('#showSeconds');
  const edited=await page.evaluate(()=>RaccoonStudio.getConfig());assert.equal(edited.name,'Raccoon • Bruno');assert.equal(edited.accent,'#59deff');assert.equal(edited.shape,'rounded');assert.equal(edited.dateLocale,'pt');assert.equal(edited.showSeconds,false);
  await page.screenshot({path:path.join(QA,'editor.png'),fullPage:true});
  await page.click('#saveEditor');assert.equal(await page.evaluate(()=>RaccoonStudio.getCatalog().length),2);
  await page.reload();await page.waitForFunction(()=>RaccoonFace.portrait.complete);assert.equal((await page.evaluate(()=>RaccoonStudio.getConfig())).name,'Raccoon • Bruno');assert.equal(await page.evaluate(()=>RaccoonStudio.getCatalog().length),2);
  await page.click('[data-tab="editor"]');const downloadPromise=page.waitForEvent('download');await page.click('#exportProject');const download=await downloadPromise;const file=await download.path();const project=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(project.format,'raccoon-studio/project');assert.equal(project.compatibility.watchfaceBinary,false);assert.equal(project.config.name,'Raccoon • Bruno');
  await page.evaluate(()=>RaccoonStudio.importProject({format:'invalid',schemaVersion:1,config:{name:'Bad'}}));assert.equal((await page.evaluate(()=>RaccoonStudio.getConfig())).name,'Raccoon • Bruno');
  await page.evaluate(()=>RaccoonStudio.importProject({format:'raccoon-studio/project',schemaVersion:1,config:{name:'<img src=x onerror=alert(1)>',accent:'invalid',width:999999,height:-10}}));let imported=await page.evaluate(()=>RaccoonStudio.getConfig());assert.equal(imported.width,2048);assert.equal(imported.height,128);assert.equal(imported.accent,'#43ff49');assert.equal(await page.locator('img[src="x"]').count(),0);
  await page.evaluate(()=>RaccoonStudio.update(RaccoonFace.DEFAULT));await page.click('[data-tab="faces"]');const pngPromise=page.waitForEvent('download');await page.click('#exportBackground');const pngDownload=await pngPromise;const pngBytes=fs.readFileSync(await pngDownload.path());assert.equal(pngBytes.subarray(1,4).toString(),'PNG');
  await page.click('[data-tab="device"]');assert.equal(await page.locator('#browserNotice').isVisible(),true);await page.click('#scanButton');assert.equal(await page.locator('#toast').isVisible(),true);
  for(const width of [320,360,402,520,1024]){await page.setViewportSize({width,height:874});for(const tab of ['faces','editor','device']){await page.evaluate(t=>RaccoonStudio.go(t),tab);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'overflow '+width+' '+tab);}}
  const nativeCtx=await browser.newContext({viewport:{width:402,height:874},deviceScaleFactor:2,acceptDownloads:true});
  await nativeCtx.route('**/*',async route=>{const name=new URL(route.request().url()).pathname.replace(/^\/assets\//,'');if(!['index.html','styles.css','face.js','app.js','jill-portrait.png'].includes(name))return route.abort();const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png'};return route.fulfill({status:200,contentType:types[path.extname(name)],body:fs.readFileSync(path.join(ASSETS,name))});});
  // TEST ONLY events exercise the JavaScript/native bridge contract, not a physical Bluetooth link.
  await nativeCtx.addInitScript(()=>{
    window.__calls=[];
    window.__sampleReport={
      device:{address:'AA:BB:CC:DD:EE:FF',name:'TEST-WATCH'},
      deviceInformation:{manufacturer:'TEST ONLY',model:'TEST-MODEL',firmware:'test-1'},
      connection:{connected:true,state:'ready'},
      services:[{uuid:'test'}],battery:{percent:78,source:'watch_ble_battery_service'},
      protocol:{status:'unverified',watchfaceTransferEnabled:false},diagnosticsComplete:true
    };
    window.Android={
      getNativeInfo:()=>JSON.stringify({appVersion:'2.0.0',nativeBluetooth:true,customBackgroundSupported:true}),
      startScan:()=>window.__calls.push('scan'),stopScan:()=>window.__calls.push('stop'),
      connect:id=>window.__calls.push(['connect',id]),disconnect:()=>window.__calls.push('disconnect'),
      getReport:()=>JSON.stringify(window.__sampleReport),
      installBackground:png=>window.__calls.push(['install-background',png]),
      cancelTransfer:()=>{window.__calls.push('cancel-transfer');window.onNativeEvent('transfer',{state:'cancelled',message:'TEST: envio cancelado'});},
      exportFile:(name,mime,base64)=>window.__calls.push(['export',name,mime,base64]),
      importProject:()=>window.__calls.push('import'),showLicenses:()=>window.__calls.push('licenses')
    };
  });
  const np=await nativeCtx.newPage();np.on('pageerror',e=>errors.push(e.message));
  await np.goto(BASE+'index.html');await np.waitForFunction(()=>RaccoonFace.portrait.complete&&RaccoonFace.portrait.naturalWidth>0);
  await np.click('[data-tab="device"]');await np.click('#scanButton');assert.ok((await np.evaluate(()=>window.__calls)).includes('scan'));
  await np.evaluate(()=>onNativeEvent('devices',{devices:[{id:'AA:BB:CC:DD:EE:FF',name:'TEST-WATCH',rssi:-55,connectable:true}],scanning:true}));
  await np.click('.device-row button');
  assert.deepEqual((await np.evaluate(()=>window.__calls)).find(x=>Array.isArray(x)&&x[0]==='connect'),['connect','AA:BB:CC:DD:EE:FF']);
  await np.evaluate(()=>{onNativeEvent('connected',{id:'AA:BB:CC:DD:EE:FF',name:'TEST-WATCH',state:'connected'});onNativeEvent('report',window.__sampleReport);});
  assert.equal(await np.locator('#connectionText').textContent(),'CONECTADO');
  assert.equal(await np.locator('#scanButton').isDisabled(),true);
  assert.ok((await np.locator('#deviceDetails').textContent()).includes('TEST-MODEL'));
  assert.ok((await np.locator('#deviceDetails').textContent()).includes('78%'));
  // A GATT connection alone must not enable installation.
  assert.equal(await np.locator('#sendFace').isDisabled(),true);
  await np.evaluate(()=>onNativeEvent('capabilities',{ready:false,transferEnabled:false,status:'unsupported_profile',message:'TEST: firmware sem suporte'}));
  assert.equal(await np.locator('#profileBadge').textContent(),'NÃO LIBERADO');
  assert.equal(await np.locator('#sendFace').isDisabled(),true);
  await np.click('#exportReport');
  const call=(await np.evaluate(()=>window.__calls)).find(x=>Array.isArray(x)&&x[0]==='export');assert.ok(call);
  const diagnostic=JSON.parse(Buffer.from(call[3],'base64').toString('utf8'));
  assert.equal(diagnostic.diagnostic.protocol.watchfaceTransferEnabled,false);assert.equal(diagnostic.format,'raccoon-studio/ble-report');
  // Only explicit device capabilities and dimensions enable a usable request.
  await np.evaluate(()=>onNativeEvent('capabilities',{ready:true,transferEnabled:true,status:'ready',screenWidth:336,screenHeight:336,sdkType:2,mode:'custom_background',message:'TEST: compatível'}));
  assert.equal(await np.locator('#sendFace').isDisabled(),false);
  assert.equal(await np.locator('#profileBadge').textContent(),'COMPATÍVEL');
  await np.click('#sendFace');
  const installs=await np.evaluate(()=>window.__calls.filter(x=>Array.isArray(x)&&x[0]==='install-background'));
  assert.equal(installs.length,1);assert.ok(installs[0][1].startsWith('data:image/png;base64,'));
  const transferPng=Buffer.from(installs[0][1].split(',')[1],'base64');
  assert.equal(transferPng.readUInt32BE(16),336);assert.equal(transferPng.readUInt32BE(20),336);
  assert.equal(await np.locator('#sendFace').isDisabled(),true);
  assert.equal(await np.locator('#disconnectButton').isDisabled(),true);
  await np.evaluate(()=>document.getElementById('sendFace').onclick());
  assert.equal(await np.evaluate(()=>window.__calls.filter(x=>Array.isArray(x)&&x[0]==='install-background').length),1);
  await np.evaluate(()=>onNativeEvent('transfer',{state:'transferring',progress:64,message:'TEST: transferindo'}));
  assert.equal(await np.locator('#transferPercent').textContent(),'64%');
  await np.evaluate(()=>onNativeEvent('transfer',{state:'transferring',progress:100,message:'TEST: bytes enviados'}));
  assert.equal(await np.locator('#transferBadge').textContent(),'EM ANDAMENTO');
  assert.notEqual((await np.evaluate(()=>RaccoonStudio.getTransfer())).state,'complete');
  await np.evaluate(()=>onNativeEvent('transfer',{state:'activating',message:'TEST: aplicando fundo'}));
  assert.equal(await np.locator('#cancelTransfer').isDisabled(),true);
  await np.evaluate(()=>onNativeEvent('transfer',{state:'complete',message:'TEST: fundo confirmado no relógio'}));
  assert.equal(await np.locator('#transferBadge').textContent(),'APLICADO');
  assert.equal(await np.locator('#sendFace').isDisabled(),false);
  assert.equal(await np.locator('#cancelTransfer').isVisible(),false);
  // A second transfer can be cancelled, and errors never produce a success state.
  await np.click('#sendFace');await np.click('#cancelTransfer');
  assert.ok((await np.evaluate(()=>window.__calls)).includes('cancel-transfer'));
  assert.equal((await np.evaluate(()=>RaccoonStudio.getTransfer())).state,'cancelled');
  await np.click('#sendFace');
  await np.evaluate(()=>onNativeEvent('transfer',{state:'error',message:'TEST: relógio não confirmou o fundo'}));
  assert.equal(await np.locator('#transferBadge').textContent(),'TENTE NOVAMENTE');
  assert.equal(await np.locator('#sendFace').isDisabled(),false);
  await np.click('#showLicenses');assert.ok((await np.evaluate(()=>window.__calls)).includes('licenses'));
  await np.evaluate(()=>onNativeEvent('connected',{state:'disconnected',name:'TEST-WATCH'}));
  assert.equal(await np.locator('#scanButton').isDisabled(),false);
  assert.equal(await np.locator('#connectionText').textContent(),'SEM RELÓGIO');
  assert.equal(await np.locator('#sendFace').isDisabled(),true);
  await np.evaluate(()=>onNativeEvent('capabilities',{ready:true,transferEnabled:true,screenWidth:336,screenHeight:336}));
  assert.equal(await np.locator('#sendFace').isDisabled(),true,'A stale capability event must not reconnect the UI');
  await np.evaluate(()=>{localStorage.clear();location.reload();});await np.waitForFunction(()=>RaccoonFace.portrait.complete&&RaccoonFace.portrait.naturalWidth>0);await np.screenshot({path:path.join(QA,'native-home.png'),fullPage:true});
  await np.click('[data-tab="device"]');await np.screenshot({path:path.join(QA,'device-unconnected.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(QA,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),status:'passed',checks:['rendering and canvas export on local HTTPS origin','round and rectangular backgrounds generated','editor fields and bounded dimensions','catalog local persistence','project JSON export and validation','untrusted labels rendered as text','PNG download','responsive layouts 320–1024 px','native bridge event contract with TEST ONLY inputs','diagnostic export and unsupported-device gate','device-reported dimensions used in transfer PNG','busy double-send prevention and cancellation','100 percent bytes does not imply activation success','disconnect invalidates transfer readiness'],pageErrors:errors,hardwareBluetoothTested:false,androidRuntimeTested:false},null,2));
  console.log(JSON.stringify({status:'passed',pageErrors:errors,artifacts:OUT,qa:QA,hardwareBluetoothTested:false,androidRuntimeTested:false}));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
