/* Theme and card tests in Chromium. No physical Android/Bluetooth validation. */
'use strict';
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),A=path.join(ROOT,'app/src/main/assets'),QA=path.join(ROOT,'build/qa');
const BASE=process.env.RACCOON_TEST_BASE||'https://appassets.androidplatform.net/assets/';
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const ctx=await b.newContext({viewport:{width:393,height:851},acceptDownloads:true});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url()),n=u.pathname.replace(/^\/assets\//,'');if(u.origin!==new URL(BASE).origin||!/^[\w.-]+$/.test(n)||!fs.existsSync(path.join(A,n)))return r.abort();return r.fulfill({contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png'})[path.extname(n)]||'text/plain',body:fs.readFileSync(path.join(A,n))});});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'studio.html');await p.waitForFunction(()=>window.LandscapeTheme&&RaccoonFace.portrait.complete);await p.waitForTimeout(400);
 assert.equal(await p.locator('#landscapeCard').count(),1);assert.equal(await p.locator('#landscapeCard .reflection').count(),5);
 assert.equal(await p.locator('#landscapeCard .tree-1').count(),1);assert.equal(await p.locator('#landscapeCard .tree-3').count(),1);
 assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');
 assert.equal(await p.locator('#cardConnection').innerText(),'Sem conexão');assert.ok(!/Spain|Cloudy|24°C/.test(await p.locator('#landscapeCard').innerText()));
 assert.match(await p.locator('#landscapeClock').innerText(),/^\d{2}:\d{2}$/);
 const colors=await p.evaluate(()=>{const x=getComputedStyle(document.querySelector('.sunset-card .sky')).backgroundImage;return x;});assert.ok(colors.includes('233, 101, 148')&&colors.includes('247, 225, 87'));
 await p.evaluate(()=>ImageStudio.update({shape:'round',width:454,height:454}));await p.waitForFunction(()=>document.getElementById('cardSize').textContent==='454 × 454');
 const original=await p.evaluate(()=>ImageStudio.getProject());await p.click('#useLandscape');await p.waitForFunction(()=>ImageStudio.getSource().name==='Paisagem · pôr do sol');
 assert.equal(await p.evaluate(()=>ImageStudio.getOptions().ecg),false);assert.equal(await p.evaluate(()=>ImageStudio.getOptions().mode),'cover');
 assert.ok((await p.evaluate(()=>ImageStudio.getSource().dataUrl)).startsWith('data:image/png;base64,'));
 const dl=p.waitForEvent('download');await p.evaluate(()=>ImageStudio.exportImage('png'));const png=fs.readFileSync(await(await dl).path());assert.equal(png.readUInt32BE(16),454);assert.equal(png.readUInt32BE(20),454);fs.writeFileSync(path.join(QA,'Landscape-fundo-454.png'),png);
 await p.click('#undo');await p.waitForFunction(()=>ImageStudio.getSource().kind==='template');assert.equal(await p.evaluate(()=>ImageStudio.getOptions().width),original.options.width);
 const longName='Uma criação com nome bastante longo para verificar a interface em telas pequenas';
 await p.evaluate(n=>ImageStudio.update({name:n}),longName);
 for(const width of [320,360,393,700,1024,1366]){await p.setViewportSize({width,height:851});for(const page of ['editor','device','gallery','help']){await p.evaluate(s=>ImageStudio.go(s),page);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}/${page}`);}}
 await p.setViewportSize({width:393,height:851});await p.evaluate(()=>ImageStudio.go('editor'));await p.screenshot({path:path.join(QA,'Landscape-mobile.png'),fullPage:true});await p.locator('.landscape-hero').screenshot({path:path.join(QA,'Landscape-card-mobile.png')});
 await p.setViewportSize({width:1366,height:1000});await p.screenshot({path:path.join(QA,'Landscape-desktop.png'),fullPage:true});
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('#landscapeCard .sun').evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(QA,'landscape-tests.json'),JSON.stringify({version:'2.3.0',status:'passed',cardSource:'user-supplied card(1).txt',checks:['card and palette','no fake weather','real project dimensions','landscape PNG and undo','responsive 320-1366','reduced motion'],hardwareTested:false,androidRuntimeTested:false,pageErrors:errors},null,2));console.log('Landscape theme checks passed. No physical Bluetooth/Android test.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
