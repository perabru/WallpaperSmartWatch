/* Raccoon Studio Image Lab 2.3 — local-only image editor. */
(function(){
'use strict';
const $=id=>document.getElementById(id),C=WatchCore,N=window.Android,canvas=$('preview');
let opts=C.options({name:'Raccoon Inventory',ecg:true,ecgX:.34,ecgY:.488,ecgW:.38,ecgH:.105}),source={kind:'template',dataUrl:'',name:'Raccoon Inventory'},image=null,gif=null,frameCanvas=null,frameIndex=-1,screen='editor',paused=false,exporting=false,transferBusy=false,connected=false,connecting=false,scanning=false,caps={},report={},toastTimer,saveTimer,loadId=0,ready=false,lastDraw=0,animationStart=performance.now(),history=[],future=[],changeBefore=null;
let knownDevices=[],nearbyDevices=[],lastDeviceSize='',smartPreference=true,manualLayout=false;
const layoutKeys=new Set(['mode','zoom','x','y','rotation','flipX','flipY','brightness','contrast','saturation']);
try{smartPreference=localStorage.getItem('raccoon-auto-fit')!=='false';}catch(e){}
$('autoFitOnImport').checked=smartPreference;
const MAX_BYTES=24*1024*1024,BUSY=new Set(['preparing','converting','transferring','uploading','activating','verifying','cancelling']);
const yieldUI=()=>new Promise(r=>setTimeout(r,0));
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),5500);}
function go(s){screen=['editor','gallery','device','help'].includes(s)?s:'editor';document.querySelectorAll('[data-screen]').forEach(e=>e.classList.toggle('active',e.dataset.screen===screen));document.querySelectorAll('[data-nav]').forEach(e=>e.classList.toggle('active',e.dataset.nav===screen));if(screen==='gallery')renderGallery();if(screen==='device'&&N&&N.refreshKnownDevices)N.refreshKnownDevices();window.scrollTo(0,0);render();}
window.navigateTo=s=>go(s==='faces'?'editor':s);
document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>go(b.dataset.nav));$('statusChip').onclick=()=>go('device');
function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function snapshot(){return{format:'raccoon-studio/image-project',schemaVersion:2,options:{...opts},source:{...source}};}
function remember(before){if(!before)return;history.push(before);if(history.length>25)history.shift();future=[];syncHistory();}
function syncHistory(){$('undo').disabled=!history.length||exporting;$('redo').disabled=!future.length||exporting;}
async function restore(s){await setSource(s.source,false);opts=C.options(s.options);manualLayout=true;sync();scheduleSave();render();}
$('undo').onclick=async()=>{if(!history.length)return;future.push(snapshot());const s=history.pop();await restore(s);syncHistory();};
$('redo').onclick=async()=>{if(!future.length)return;history.push(snapshot());const s=future.pop();await restore(s);syncHistory();};
function update(patch,saveHistory=true){if(exporting)return;if(saveHistory)remember(snapshot());if(Object.keys(patch).some(k=>layoutKeys.has(k)))manualLayout=true;opts=C.options({...opts,...patch});if(!manualLayout&&smartPreference&&source.kind==='image'&&Object.keys(patch).every(k=>['width','height','shape'].includes(k)))smartFit(false);sync();render();scheduleSave();}
function smartFit(record=true){
 if(exporting||!window.SmartFit)return;
 if(source.kind==='template'){$('smartStatus').textContent='O inventário já tem enquadramento próprio. Escolha uma imagem para ajustá-la automaticamente.';return;}
 const src=sourceFrame(0);if(!src)return;
 const iw=src.naturalWidth||src.width,ih=src.naturalHeight||src.height;
 const scale=Math.min(1,112/Math.max(iw,ih)),sample=makeCanvas(Math.max(1,Math.round(iw*scale)),Math.max(1,Math.round(ih*scale)));
 const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0,sample.width,sample.height);
 const analysis=SmartFit.analyze(ctx.getImageData(0,0,sample.width,sample.height));
 const result=SmartFit.plan(analysis,iw,ih,opts.width,opts.height,opts.shape,$('smartStrategy').value);
 if(record)remember(snapshot());opts=C.options({...opts,...result.patch});manualLayout=false;
 $('smartStatus').textContent=result.message+' Ajuste local e reversível; confira a prévia.';
 sync();render();scheduleSave();return result;
}
$('smartFit').onclick=()=>{smartFit();toast('Imagem ajustada. Use Desfazer para comparar.');};
$('autoFitOnImport').onchange=()=>{smartPreference=$('autoFitOnImport').checked;try{localStorage.setItem('raccoon-auto-fit',String(smartPreference));}catch(e){}};
$('smartStrategy').onchange=()=>smartFit();
function sync(){
 for(const el of document.querySelectorAll('[data-option]')){const value=opts[el.dataset.option];if(el.type==='checkbox')el.checked=value;else el.value=el.dataset.scale?Math.round(value*+el.dataset.scale):value;}
 $('projectName').value=opts.name;$('zoomValue').textContent=Math.round(opts.zoom*100)+'%';$('rotationValue').textContent=Math.round(opts.rotation)+'°';for(const k of ['brightness','contrast','saturation'])$(k+'Value').textContent=opts[k]+'%';
 $('outHeight').disabled=['round','square'].includes(opts.shape);$('resolutionLabel').textContent=opts.width+' × '+opts.height;
 $('bezel').className='bezel '+opts.shape;const size=opts.width+'x'+opts.height;$('preset').value=[...$('preset').options].some(x=>x.value===size)?size:'custom';
 const pw=480,ph=Math.max(1,Math.round(pw*opts.height/opts.width));const scale=Math.min(1,720/ph);canvas.width=Math.round(pw*scale);canvas.height=Math.round(ph*scale);
 $('sourceLabel').textContent=source.kind==='template'?'RACCOON INVENTORY':gif?'GIF · '+gif.frames.length+' QUADROS':'SUA IMAGEM';syncHistory();
}
function clip(c,w,h){c.beginPath();if(opts.shape==='round')c.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2);else if(opts.shape==='rounded'){const r=Math.min(w,h)*.16;c.moveTo(r,0);c.arcTo(w,0,w,h,r);c.arcTo(w,h,0,h,r);c.arcTo(0,h,0,0,r);c.arcTo(0,0,w,0,r);}else c.rect(0,0,w,h);c.closePath();c.clip();}
const template=makeCanvas(512,512);
function sourceFrame(t){
 if(source.kind==='template'){RaccoonFace.draw(template,RaccoonFace.DEFAULT,{backgroundOnly:true});return template;}
 if(gif){const total=gif.delays.reduce((s,v)=>s+v,0);let at=((t%total)+total)%total,i=0;while(i<gif.frames.length-1&&at>=gif.delays[i]){at-=gif.delays[i];i++;}if(i!==frameIndex){frameCanvas.getContext('2d').putImageData(new ImageData(gif.frames[i],gif.width,gif.height),0,0);frameIndex=i;}return frameCanvas;}return image;
}
function ecg(c,w,h,t){const x=opts.ecgX*w,y=opts.ecgY*h,rw=opts.ecgW*w,rh=opts.ecgH*h;c.save();c.beginPath();c.rect(x,y,rw,rh);c.clip();c.fillStyle=opts.ecgBackground;c.fillRect(x,y,rw,rh);c.globalAlpha=.2;c.strokeStyle=opts.ecgColor;c.lineWidth=.6;for(let gy=y;gy<=y+rh;gy+=Math.max(3,rh/10)){c.beginPath();c.moveTo(x,gy);c.lineTo(x+rw,gy);c.stroke();}c.globalAlpha=1;c.strokeStyle=opts.ecgColor;c.lineWidth=Math.max(1.4,w/220);c.shadowColor=opts.ecgColor;c.shadowBlur=w/95;c.beginPath();for(let k=0;k<=Math.ceil(rw);k++){const u=((k/rw+t/1500*opts.ecgSpeed)%1+1)%1;const g=(mu,s,a)=>a*Math.exp(-Math.pow((u-mu)/s,2));const v=g(.35,.035,.12)-g(.47,.012,.18)+g(.5,.015,.75)-g(.535,.017,.27)+g(.66,.055,.18);const py=y+rh*.65-v*rh*.75;k?c.lineTo(x+k,py):c.moveTo(x+k,py);}c.stroke();c.restore();}
function draw(target,{preview=false,time=0,opaque=false}={}){
 const c=target.getContext('2d'),w=target.width,h=target.height;c.clearRect(0,0,w,h);if(opaque||!opts.transparent){c.fillStyle=opts.background;c.fillRect(0,0,w,h);}c.save();clip(c,w,h);c.fillStyle=opts.background;c.fillRect(0,0,w,h);
 const src=sourceFrame(time);if(src){const iw=src.naturalWidth||src.width,ih=src.naturalHeight||src.height;
  if(opts.mode==='blur'){const d=C.fit(iw,ih,w,h,'cover');c.save();c.filter='blur('+Math.max(8,w/30)+'px) brightness(65%)';c.drawImage(src,(w-d.w*1.15)/2,(h-d.h*1.15)/2,d.w*1.15,d.h*1.15);c.restore();}
  const d=C.fit(iw,ih,w,h,opts.mode,opts.rotation);c.save();c.translate(w/2+opts.x*w,h/2+opts.y*h);c.rotate(opts.rotation*Math.PI/180);c.scale(opts.zoom*(opts.flipX?-1:1),opts.zoom*(opts.flipY?-1:1));c.filter=`brightness(${opts.brightness}%) contrast(${opts.contrast}%) saturate(${opts.saturation}%)`;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(src,-d.w/2,-d.h/2,d.w,d.h);c.restore();
 }
 if(opts.ecg)ecg(c,w,h,time);
 if(opts.text){c.fillStyle=opts.textColor;c.textAlign='center';c.textBaseline='middle';c.font=`600 ${Math.max(10,w*opts.textSize/100)}px sans-serif`;c.shadowColor='#000';c.shadowBlur=w/70;c.fillText(opts.text,w/2,h*opts.textY,w*.85);c.shadowBlur=0;}
 if(preview&&opts.clock){c.fillStyle=opts.clockColor;c.textAlign='center';c.textBaseline='middle';c.font=`700 ${w*.13}px sans-serif`;c.shadowColor='#000';c.shadowBlur=w/50;c.fillText(new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),w/2,h*opts.clockY);}
 c.restore();return target;
}
function render(){draw(canvas,{preview:true,time:paused?0:performance.now()-animationStart});}
function tick(now){if(!document.hidden&&screen==='editor'&&!exporting&&(opts.ecg||gif||opts.clock)&&now-lastDraw>(opts.ecg||gif?65:1000)){render();lastDraw=now;}requestAnimationFrame(tick);}
for(const el of document.querySelectorAll('[data-option]')){
 el.addEventListener('pointerdown',()=>{changeBefore=snapshot();});el.addEventListener('focus',()=>{if(!changeBefore)changeBefore=snapshot();});
 const applyControl=()=>{const k=el.dataset.option;let value=el.type==='checkbox'?el.checked:el.type==='number'||el.type==='range'?+el.value:el.value;if(el.dataset.scale)value/=+el.dataset.scale;if(layoutKeys.has(k))manualLayout=true;opts=C.options({...opts,[k]:value});if(el.id==='shape'&&['rectangle','rounded'].includes(opts.shape)&&opts.width===opts.height)opts.height=Math.round(opts.width*1.22);if(!manualLayout&&smartPreference&&source.kind==='image'&&['width','height','shape'].includes(k))smartFit(false);sync();render();scheduleSave();};
 el.addEventListener('input',()=>{if(el.type!=='number')applyControl();});
 el.addEventListener('change',()=>{if(el.type==='number')applyControl();remember(changeBefore);changeBefore=null;});el.addEventListener('blur',()=>{changeBefore=null;});
}
$('projectName').onchange=()=>update({name:$('projectName').value});$('preset').onchange=()=>{if($('preset').value!=='custom'){const[w,h]=$('preset').value.split('x').map(Number);update({width:w,height:h});}};
$('center').onclick=()=>update({x:0,y:0});$('rotate90').onclick=()=>update({rotation:opts.rotation>=90?opts.rotation-270:opts.rotation+90});
$('reset').onclick=()=>update({zoom:1,x:0,y:0,rotation:0,flipX:false,flipY:false,brightness:100,contrast:100,saturation:100,mode:'cover'});
$('toggleAnimation').onclick=()=>{paused=!paused;$('toggleAnimation').textContent=paused?'Reproduzir animação':'Pausar animação';render();};
// Touch gestures in normalized viewport coordinates: pan, pinch and rotation.
let pointers=new Map(),gesture=null;
function startGesture(){const p=[...pointers.values()];gesture={points:p.map(x=>({...x})),o:{...opts},before:snapshot()};}
canvas.addEventListener('pointerdown',e=>{e.preventDefault();if(exporting)return;if(!pointers.size)changeBefore=snapshot();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);startGesture();});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=[...pointers.values()],a=gesture.points,b=canvas.getBoundingClientRect();let patch={};
 if(p.length===1&&a.length===1){patch.x=gesture.o.x+(p[0].x-a[0].x)/b.width;patch.y=gesture.o.y+(p[0].y-a[0].y)/b.height;}
 if(p.length>=2&&a.length>=2){const dist=z=>Math.hypot(z[1].x-z[0].x,z[1].y-z[0].y),ang=z=>Math.atan2(z[1].y-z[0].y,z[1].x-z[0].x);const ratio=dist(p)/Math.max(5,dist(a));const delta=ang(p)-ang(a);const anchorX=(a[0].x+a[1].x)/2-b.left-b.width/2,anchorY=(a[0].y+a[1].y)/2-b.top-b.height/2;const oldX=gesture.o.x*b.width-anchorX,oldY=gesture.o.y*b.height-anchorY;patch.zoom=gesture.o.zoom*ratio;patch.rotation=((gesture.o.rotation+delta*180/Math.PI+540)%360)-180;patch.x=((p[0].x+p[1].x)/2-b.left-b.width/2+(oldX*Math.cos(delta)-oldY*Math.sin(delta))*ratio)/b.width;patch.y=((p[0].y+p[1].y)/2-b.top-b.height/2+(oldX*Math.sin(delta)+oldY*Math.cos(delta))*ratio)/b.height;}
 manualLayout=true;opts=C.options({...opts,...patch});sync();render();});
function endPointer(e){if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(pointers.size)startGesture();else{gesture=null;remember(changeBefore);changeBefore=null;scheduleSave();}}
for(const t of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(t,endPointer);
canvas.addEventListener('wheel',e=>{e.preventDefault();update({zoom:opts.zoom*Math.exp(-e.deltaY*.001)});},{passive:false});
async function dataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Falha ao ler arquivo'));r.readAsDataURL(blob);});}
function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function from64(s){const v=atob(s),b=new Uint8Array(v.length);for(let i=0;i<v.length;i++)b[i]=v.charCodeAt(i);return b;}
async function setSource(s,record=true){
 if(exporting)throw Error('Conclua a exportação antes de trocar a imagem.');
 const id=++loadId,before=snapshot();if(!s||!['template','image'].includes(s.kind))throw Error('Fonte de imagem inválida');
 let nextImage=null,nextGif=null,nextData=s.dataUrl||'',nextName=String(s.name||'Imagem').slice(0,120);
 if(s.kind==='image'){
  if(!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(nextData)||nextData.length>MAX_BYTES*1.4)throw Error('Formato de imagem inválido ou arquivo acima de 24 MB');
  if(nextData.startsWith('data:image/gif;')){
   nextGif=C.decodeGif(from64(nextData.split(',')[1]));if(nextGif.truncated)toast('GIF limitado a '+nextGif.frames.length+' quadros para proteger a memória.');
  }else{
   nextImage=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Esta imagem não pôde ser decodificada'));im.src=nextData;});
   if(nextImage.naturalWidth*nextImage.naturalHeight>64000000)throw Error('Imagem acima de 64 milhões de pixels. Reduza antes de importar.');
   const scale=Math.min(1,2048/Math.max(nextImage.naturalWidth,nextImage.naturalHeight));if(scale<1){const down=makeCanvas(Math.round(nextImage.naturalWidth*scale),Math.round(nextImage.naturalHeight*scale));down.getContext('2d').drawImage(nextImage,0,0,down.width,down.height);nextData=down.toDataURL('image/png');nextImage=down;toast('Imagem reduzida para até 2048 px para edição segura.');}
  }
 }
 if(id!==loadId)return false;if(record)remember(before);manualLayout=!record;source={kind:s.kind,dataUrl:nextData,name:nextName};image=nextImage;gif=nextGif;frameIndex=-1;frameCanvas=gif?makeCanvas(gif.width,gif.height):null;animationStart=performance.now();
 opts=C.options({...opts,ecg:record?s.kind==='template':opts.ecg,name:s.kind==='template'?'Raccoon Inventory':nextName.replace(/\.[^.]+$/,'').slice(0,60),x:0,y:0,zoom:1,rotation:0,flipX:false,flipY:false});
 const sw=gif?gif.width:image&&(image.naturalWidth||image.width),sh=gif?gif.height:image&&(image.naturalHeight||image.height);$('imageInfo').textContent=s.kind==='template'?'Arte de inventário · hora e data ficam livres para o relógio.':`${sw} × ${sh} px · ${gif?gif.frames.length+' quadros · ':''}${nextName}`;
 if(record&&s.kind==='image'&&smartPreference)smartFit(false);
 sync();render();scheduleSave();return true;
}
async function loadFile(file){if(!file)return;try{if(file.size>MAX_BYTES)throw Error('Escolha um arquivo de até 24 MB');let mime=file.type.toLowerCase();const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());if(bytes[0]===0x47&&bytes[1]===0x49&&bytes[2]===0x46)mime='image/gif';else if(bytes[0]===0x89&&bytes[1]===0x50)mime='image/png';else if(bytes[0]===0xff&&bytes[1]===0xd8)mime='image/jpeg';else if(bytes[0]===0x52&&bytes[8]===0x57)mime='image/webp';if(!['image/png','image/jpeg','image/webp','image/gif'].includes(mime))throw Error('Formato não suportado pelo navegador. No Android, use Escolher imagem para conversão nativa.');await setSource({kind:'image',name:file.name,dataUrl:await dataURL(new Blob([await file.arrayBuffer()],{type:mime}))});}catch(e){toast(e.message||'Falha ao importar imagem');}}
$('pickImage').onclick=()=>N&&N.importImage?N.importImage():$('imageInput').click();$('imageInput').onchange=e=>{loadFile(e.target.files[0]);e.target.value='';};
$('useTemplate').onclick=async()=>{await setSource({kind:'template',name:'Raccoon Inventory'});update({ecg:true,ecgX:.34,ecgY:.488,ecgW:.38,ecgH:.105});};
canvas.addEventListener('dragover',e=>e.preventDefault());canvas.addEventListener('drop',e=>{e.preventDefault();loadFile(e.dataTransfer.files[0]);});
// Four-point perspective correction with bilinear sampling.
let cropPoints=[],cropDrag=-1,cropSource=null,cropBox=null;
function cropDraw(){const c=$('cropCanvas').getContext('2d'),w=c.canvas.width,h=c.canvas.height;c.fillStyle='#0c0b13';c.fillRect(0,0,w,h);const d=C.fit(cropSource.width||cropSource.naturalWidth,cropSource.height||cropSource.naturalHeight,w,h,'contain');cropBox={x:(w-d.w)/2,y:(h-d.h)/2,w:d.w,h:d.h};c.drawImage(cropSource,cropBox.x,cropBox.y,d.w,d.h);c.strokeStyle='#c8a9ff';c.lineWidth=3;c.beginPath();cropPoints.forEach((p,i)=>{const x=cropBox.x+p[0]*d.w,y=cropBox.y+p[1]*d.h;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fillStyle='#bd9aff25';c.fill();c.stroke();cropPoints.forEach((p,i)=>{const x=cropBox.x+p[0]*d.w,y=cropBox.y+p[1]*d.h;c.fillStyle='#c8a9ff';c.beginPath();c.arc(x,y,16,0,Math.PI*2);c.fill();c.fillStyle='#1b1028';c.textAlign='center';c.textBaseline='middle';c.font='bold 16px sans-serif';c.fillText(i+1,x,y);});}
$('perspective').onclick=()=>{cropSource=sourceFrame(paused?0:performance.now()-animationStart);if(!cropSource)return;const copy=makeCanvas(cropSource.naturalWidth||cropSource.width,cropSource.naturalHeight||cropSource.height);copy.getContext('2d').drawImage(cropSource,0,0);cropSource=copy;cropPoints=[[.1,.1],[.9,.1],[.9,.9],[.1,.9]];$('cropDialog').showModal();cropDraw();};
function cropPosition(e){const r=$('cropCanvas').getBoundingClientRect();return[(e.clientX-r.left)*640/r.width,(e.clientY-r.top)*640/r.height];}
$('cropCanvas').onpointerdown=e=>{const p=cropPosition(e);let best=Infinity;cropPoints.forEach((a,i)=>{const d=Math.hypot(cropBox.x+a[0]*cropBox.w-p[0],cropBox.y+a[1]*cropBox.h-p[1]);if(d<best){best=d;cropDrag=i;}});$('cropCanvas').setPointerCapture(e.pointerId);};
$('cropCanvas').onpointermove=e=>{if(cropDrag<0)return;const p=cropPosition(e);cropPoints[cropDrag]=[C.clamp((p[0]-cropBox.x)/cropBox.w,0,1),C.clamp((p[1]-cropBox.y)/cropBox.h,0,1)];cropDraw();};for(const t of ['pointerup','pointercancel','lostpointercapture'])$('cropCanvas').addEventListener(t,()=>cropDrag=-1);
$('cropCancel').onclick=()=>$('cropDialog').close();
$('cropApply').onclick=async()=>{try{const m=C.homography(cropPoints),iw=cropSource.width,ih=cropSource.height,w=Math.min(1024,opts.width*2),h=Math.min(1024,opts.height*2),out=makeCanvas(w,h),pixels=cropSource.getContext('2d').getImageData(0,0,iw,ih),result=out.getContext('2d').createImageData(w,h);$('cropApply').disabled=true;await yieldUI();for(let y=0;y<h;y++){for(let x=0;x<w;x++){const p=C.project(m,x/Math.max(1,w-1),y/Math.max(1,h-1)),sx=C.clamp(p[0]*(iw-1),0,iw-1),sy=C.clamp(p[1]*(ih-1),0,ih-1),x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;for(let k=0;k<4;k++){const a=pixels.data[(y0*iw+x0)*4+k],b=pixels.data[(y0*iw+Math.min(iw-1,x0+1))*4+k],c=pixels.data[(Math.min(ih-1,y0+1)*iw+x0)*4+k],d=pixels.data[(Math.min(ih-1,y0+1)*iw+Math.min(iw-1,x0+1))*4+k];result.data[(y*w+x)*4+k]=(a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;}}if(y%96===0)await yieldUI();}out.getContext('2d').putImageData(result,0,0);await setSource({kind:'image',name:'Recorte - '+source.name,dataUrl:out.toDataURL('image/png')});$('cropDialog').close();toast('Perspectiva corrigida. Desfazer recupera a imagem anterior.');}catch(e){toast(e.message);}finally{$('cropApply').disabled=false;}};
// Export files: native Storage Access Framework or browser Blob download.
async function deliver(blob,name){if(blob.size>40*1024*1024)throw Error('Arquivo acima de 40 MB. Reduza a resolução ou duração.');if(N&&N.exportFile){N.exportFile(name,blob.type,(await dataURL(blob)).split(',')[1]);return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Arquivo pronto para salvar.');}
function slug(){return opts.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'mostrador';}
function canvasBlob(c,mime,quality=.93){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Falha ao exportar imagem')),mime,quality));}
async function exportImage(type=$('exportType').value){if(exporting)return;exporting=true;document.querySelector('.workspace').inert=true;document.querySelector('nav').inert=true;document.body.classList.add('busy');$('exportProgress').hidden=false;$('exportProgress').value=0;try{let w=opts.width,h=opts.height,blob,ext=type;
 if(type==='gif'){
  if(!opts.ecg&&!gif)throw Error('Ative a barra de saúde ou importe um GIF para exportar uma animação.');const scale=Math.min(1,512/Math.max(w,h));w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));const totalGif=gif?gif.delays.reduce((a,b)=>a+b,0):0;let frames=[],delays=[];const out=makeCanvas(w,h);
  // Preserve source frame timing when no extra ECG is added; otherwise use a regular timebase.
  const times=[];if(gif&&!opts.ecg){let t=0;for(const d of gif.delays){times.push(t);delays.push(d);t+=d;}}else{const count=Math.round(opts.gifSeconds*opts.gifFps);for(let i=0;i<count;i++){times.push(i*1000/opts.gifFps);delays.push(Math.round(1000/opts.gifFps));}}
  if(times.length*w*h>24000000)throw Error('Muitos pixels para exportar GIF. Reduza os quadros ou a resolução.');for(let i=0;i<times.length;i++){draw(out,{time:times[i],opaque:true});frames.push(out.getContext('2d').getImageData(0,0,w,h).data);$('exportProgress').value=Math.round((i+1)/times.length*80);await yieldUI();}
  blob=new Blob([C.encodeGif(frames,w,h,delays)],{type:'image/gif'});frames=[];if(scale<1)toast('GIF ajustado para '+w+' × '+h+' px.');
 }else{const mime={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}[type]||'image/png';const out=makeCanvas(w,h);draw(out,{opaque:type==='jpeg',time:0});blob=await canvasBlob(out,mime);if(blob.type!==mime){ext='png';toast('Formato não disponível neste Android. Exportando PNG.');}else if(type==='jpeg')ext='jpg';}
 $('exportProgress').value=100;await deliver(blob,slug()+'-'+w+'x'+h+'.'+ext);
 }catch(e){toast(e.message||'Não foi possível exportar');}finally{exporting=false;document.querySelector('.workspace').inert=false;document.querySelector('nav').inert=false;document.body.classList.remove('busy');$('exportProgress').hidden=true;render();}}
$('exportImage').onclick=()=>exportImage();
// IndexedDB stores original image plus adjustments, not only thumbnails.
const dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('raccoon-image-lab',1);r.onupgradeneeded=()=>{r.result.createObjectStore('projects',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Armazenamento local indisponível'));});dbPromise.catch(()=>{});
async function store(action,value){const db=await dbPromise;return new Promise((resolve,reject)=>{const tx=db.transaction('projects',action==='getAll'||action==='get'?'readonly':'readwrite'),s=tx.objectStore('projects'),req=action==='getAll'?s.getAll():s[action](value);let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(Error('Sem espaço no armazenamento. Exporte o projeto para backup.'));tx.onabort=tx.onerror;});}
function scheduleSave(){if(!ready)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>store('put',{id:'__draft',updatedAt:Date.now(),project:snapshot()}).catch(()=>{}),700);}
async function saveProject(){try{const all=await store('getAll');if(all.filter(x=>x.id!=='__draft').length>=32)throw Error('Catálogo com 32 projetos. Exporte ou exclua um antes de salvar.');const thumb=makeCanvas(180,Math.round(180*opts.height/opts.width));draw(thumb,{time:0,opaque:true});await store('put',{id:'image-'+Date.now()+'-'+Math.random().toString(16).slice(2,8),updatedAt:Date.now(),project:snapshot(),thumb:thumb.toDataURL('image/jpeg',.8)});toast('Projeto completo salvo no catálogo.');}catch(e){toast(e.message);}}
$('saveProject').onclick=saveProject;
async function renderGallery(){const root=$('gallery');root.replaceChildren();try{const all=(await store('getAll')).filter(x=>x.id!=='__draft').sort((a,b)=>b.updatedAt-a.updatedAt);if(!all.length){const p=document.createElement('p');p.textContent='Seu catálogo está vazio. Abra uma imagem e toque em Meu catálogo.';root.append(p);}for(const item of all){const article=document.createElement('article'),img=new Image(),title=document.createElement('h3'),meta=document.createElement('p'),row=document.createElement('div'),open=document.createElement('button'),remove=document.createElement('button');img.src=item.thumb;img.alt='Prévia de '+item.project.options.name;title.textContent=item.project.options.name;meta.className='muted';meta.textContent=item.project.options.width+' × '+item.project.options.height+' · '+new Date(item.updatedAt).toLocaleDateString('pt-BR');open.textContent='Editar ↗';open.onclick=async()=>{remember(snapshot());await restore(item.project);go('editor');};remove.textContent='Excluir';remove.onclick=async()=>{if(window.confirm('Excluir este projeto do catálogo? Os arquivos exportados serão preservados.')){await store('delete',item.id);renderGallery();}};row.className='export-row';row.append(open,remove);article.append(img,title,meta,row);root.append(article);}}catch(e){toast(e.message);}}
async function importProject(p){if(!p||p.format!=='raccoon-studio/image-project'||p.schemaVersion!==2||!p.source||!p.options)throw Error('Selecione um projeto Image Lab versão 2.');remember(snapshot());await restore(p);go('editor');toast('Projeto importado. Salve no catálogo para guardar uma cópia.');}
$('importProject').onclick=()=>N&&N.importProject?N.importProject():$('projectInput').click();$('projectInput').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>36*1024*1024)throw Error('Projeto acima de 36 MB');await importProject(JSON.parse(await f.text()));}catch(err){toast(err.message);}finally{e.target.value='';}};
$('exportProject').onclick=()=>deliver(new Blob([JSON.stringify(snapshot())],{type:'application/json'}),slug()+'.raccoon-image.json').catch(e=>toast(e.message));
// Existing JieLi native adapter remains the authority for device safety and compatibility.
function canSend(){return !!(N&&N.installBackground&&connected&&caps.ready===true&&caps.transferEnabled===true&&!transferBusy);}
function detectedSize(){const w=Number(caps.screenWidth),h=Number(caps.screenHeight);return Number.isInteger(w)&&Number.isInteger(h)&&w>=64&&h>=64&&w<=1024&&h<=1024?{width:w,height:h}:null;}
function refreshDevice(){const ok=canSend();$('nativeSend').disabled=!ok;$('nativeSend').textContent=transferBusy?'Envio em andamento…':ok?'Enviar imagem atual (PNG)':'Conecte um relógio compatível';$('cancelTransfer').disabled=!transferBusy;$('scan').disabled=connected||connecting||transferBusy;$('disconnect').disabled=(!connected&&!connecting)||transferBusy;$('statusChip').textContent=connected?'● CONECTADO AO APP':knownDevices.some(d=>d.candidate)?'● DISPOSITIVO ENCONTRADO':'● LOCAL';renderDeviceList();}
$('scan').onclick=()=>{if(!N||!N.startScan){toast('A conexão Bluetooth está disponível no APK Android.');return;}scanning=!scanning;scanning?N.startScan():N.stopScan();$('scan').textContent=scanning?'Parar busca':'Buscar nas proximidades';};
$('disconnect').onclick=()=>N&&N.disconnect&&N.disconnect();$('cancelTransfer').onclick=()=>{if(N&&N.cancelTransfer)N.cancelTransfer();};
function updateCapabilities(data){caps=data||{};if(caps.message)$('deviceStatus').textContent=caps.message;const size=detectedSize();
 if(caps.ready===true&&size&&$('autoDeviceSize').checked){const key=size.width+'x'+size.height;if(lastDeviceSize!==key){lastDeviceSize=key;update({...size,shape:size.width===size.height?opts.shape:'rounded'});$('smartStatus').textContent+=' Resolução confirmada pelo relógio: '+key+' px.';}}
 refreshDevice();} 
$('autoDeviceSize').onchange=()=>{lastDeviceSize='';updateCapabilities(caps);};
function updateReport(data){report=data||{};if(report.connection)connected=report.connection.connected===true;updateCapabilities(report.protocol&&report.protocol.capabilities||report.capabilities||report.protocol||{});const info=report.deviceInformation||{},size=detectedSize();$('deviceInfo').textContent=[report.device&&report.device.name,info.manufacturer,info.model,info.firmware||caps.firmwareVersion,size?size.width+' × '+size.height+' px':'Resolução não informada',report.battery&&Number.isFinite(report.battery.percent)?'Bateria: '+report.battery.percent+'%':null].filter(Boolean).join('\n');}
function renderDeviceList(){
 const root=$('devices');root.replaceChildren();const list=DeviceList.merge(knownDevices,nearbyDevices);
 for(const d of list){const row=document.createElement('div'),div=document.createElement('div'),name=document.createElement('strong'),desc=document.createElement('small'),button=document.createElement('button');row.className='device-row';
 name.textContent=(d.remembered?'★ ':d.candidate?'⌚ ':'')+(d.name||'Sem nome');desc.textContent=DeviceList.describe(d)+' · '+d.id;
 button.textContent=d.classicOnly?'Canal de áudio':'Verificar';button.disabled=connected||connecting||transferBusy||d.classicOnly===true||d.connectable===false||!N;
 button.onclick=()=>{connecting=true;refreshDevice();$('deviceStatus').textContent='Conectando a '+(d.name||'relógio')+' para verificar o protocolo…';N.connect(d.id);};div.append(name,desc);row.append(div,button);root.append(row);}
}
function devices(data){scanning=!!data.scanning;nearbyDevices=data.devices||[];$('scan').textContent=scanning?'Parar busca':'Buscar nas proximidades';renderDeviceList();}
function known(data){knownDevices=Array.isArray(data.devices)?data.devices:[];$('catalogStatus').textContent=(data.message||'')+(data.partial?' Consulta parcial; atualize para conferir.':'');refreshDevice();}
$('refreshKnown').onclick=()=>{if(N&&N.refreshKnownDevices)N.refreshKnownDevices();else toast('Disponível no APK Android.');};

async function send(){go('device');if(!canSend()){toast('Conecte o relógio e aguarde a confirmação de compatibilidade.');return;}const size=detectedSize();if(!size){toast('O relógio não informou uma resolução válida.');return;}if(gif||opts.ecg)toast('O envio Bluetooth aplica somente o primeiro quadro estático.');const out=makeCanvas(size.width,size.height);draw(out,{time:0,opaque:true});transferBusy=true;refreshDevice();try{N.installBackground(out.toDataURL('image/png'));}catch(e){transferBusy=false;refreshDevice();toast('Falha ao iniciar o envio.');}}
$('sendImage').onclick=send;$('nativeSend').onclick=send;$('useDeviceSize').onclick=()=>{const s=detectedSize();if(!s){toast('Conecte o relógio para consultar a resolução.');return;}update({...s,shape:s.width===s.height?opts.shape:'rounded'});};
$('saveDiagnostic').onclick=()=>{let d=report;if(N&&N.getReport)try{d=JSON.parse(N.getReport());}catch(e){}deliver(new Blob([JSON.stringify({format:'raccoon-studio/ble-report',appVersion:'2.3.0',diagnostic:d},null,2)],{type:'application/json'}),'watch8-ultra-diagnostico.json').catch(e=>toast(e.message));};
window.onNativeEvent=async(type,data={})=>{try{switch(type){case 'nativeReady':break;case 'imageImport':await setSource({kind:'image',name:data.name||'Imagem',dataUrl:'data:'+data.mime+';base64,'+data.base64});break;case 'projectImport':await importProject(data);break;case 'fileExport':toast(data.state==='saved'?'Salvo: '+data.name:'Salvamento cancelado.');break;case 'knownDevices':known(data);break;case 'devices':devices(data);break;case 'report':updateReport(data);break;case 'capabilities':updateCapabilities(data);break;case 'connected':lastDeviceSize='';connected=data.state==='connected';connecting=false;caps={};if(!connected&&transferBusy){transferBusy=false;$('transferState').textContent='Conexão perdida antes da confirmação.';}$('deviceStatus').textContent=connected?'Conectado. Verificando o protocolo e as capacidades.':'Relógio desconectado.';refreshDevice();break;case 'status':$('deviceStatus').textContent=data.message||'';if(data.state==='scan_complete'||data.state==='stopped'){scanning=false;$('scan').textContent='Buscar nas proximidades';}break;case 'transfer':transferBusy=BUSY.has(data.state);$('transferState').textContent=data.message||data.state;$('transferProgress').value=Number.isFinite(data.progress)?data.progress:0;refreshDevice();if(['activating','verifying','cancelling'].includes(data.state))$('cancelTransfer').disabled=true;break;case 'error':connecting=false;scanning=false;$('scan').textContent='Buscar nas proximidades';$('deviceStatus').textContent=data.message||'Falha na operação.';refreshDevice();toast(data.message||'Falha na operação.');break;}}catch(e){toast(e.message||'Falha ao processar arquivo');}};
$('licenses').onclick=()=>N&&N.showLicenses?N.showLicenses():toast('Licenças em THIRD_PARTY_NOTICES.md, no projeto.');$('classic').onclick=()=>{window.location.href='index.html';};
window.ImageStudio={smartFit,getOptions:()=>({...opts}),getProject:snapshot,getPage:()=>screen,update,draw,loadFile,setSource,importProject,saveProject,exportImage,go,canSend,getSource:()=>({...source}),getGif:()=>gif?{frames:gif.frames.length,delays:[...gif.delays]}:null,project:C.project};
// Native back-button compatibility; the classic editor exposes the same contract.
window.RaccoonStudio={getPage:()=>screen==='editor'?'faces':screen};
(async()=>{try{const saved=await store('get','__draft');if(saved&&saved.project)await restore(saved.project);else{opts=C.options({name:'Raccoon Inventory',ecg:true,ecgX:.34,ecgY:.488,ecgW:.38,ecgH:.105});}}catch(e){}finally{ready=true;sync();render();refreshDevice();if(N&&N.getReport)try{updateReport(JSON.parse(N.getReport()));}catch(e){}if(N&&N.getKnownDevices)try{known(JSON.parse(N.getKnownDevices()));}catch(e){}if(!RaccoonFace.portrait.complete)RaccoonFace.portrait.addEventListener('load',render,{once:true});requestAnimationFrame(tick);}})();
})();
