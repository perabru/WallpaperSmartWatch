/* Landscape Edition. Local rendering; no weather API or fabricated device telemetry. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
if(!window.ImageStudio||!$('landscapeCard'))return;
const names={round:'Redondo',square:'Quadrado',rectangle:'Retangular',rounded:'Arredondado'};
function put(id,value){const e=$(id);if(e&&e.textContent!==value)e.textContent=value;}
function sync(){
 const o=ImageStudio.getOptions(),d=new Date(),state=$('statusChip').textContent;
 put('landscapeClock',d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
 put('landscapeDate',d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}));
 put('cardShape',names[o.shape]||'Personalizado');put('cardSize',o.width+' × '+o.height);
 const status=ImageStudio.canSend()?'Pronto para enviar':state.includes('CONECTADO AO APP')?'Verificando':state.includes('ENCONTRADO')?'Encontrado':'Sem conexão';
 put('cardConnection',status);$('cardConnection').title=status;
}
function ellipse(c,x,y,rx,ry,fill){c.fillStyle=fill;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
function tree(c,x,y,w,h,color){
 c.fillStyle=color;ellipse(c,x+w*.5,y+h*.36,w*.34,h*.36,color);
 c.fillRect(x+w*.44,y+h*.50,w*.12,h*.45);
 ellipse(c,x+w*.5,y+h*.95,w*.06,h*.05,color);
}
function createLandscape(size=1024){
 if(!Number.isInteger(size)||size<64||size>2048)throw Error('Tamanho de imagem inválido');
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const c=canvas.getContext('2d');c.scale(size,size);
 const sky=c.createLinearGradient(0,0,0,.78);sky.addColorStop(0,'#e96594');sky.addColorStop(1,'#f7e157');c.fillStyle=sky;c.fillRect(0,0,1,1);
 ellipse(c,.33,.40,.128,.128,'#ffffff18');ellipse(c,.33,.40,.112,.112,'#ffffff38');ellipse(c,.33,.40,.09,.09,'#ffffff');
 ellipse(c,1.03,.69,.4,.12,'#e6b29d');ellipse(c,1.05,.76,.37,.20,'#c29182');
 const sea=c.createLinearGradient(0,.72,0,1);sea.addColorStop(0,'#f7da96');sea.addColorStop(1,'#f1c07d');c.fillStyle=sea;c.fillRect(0,.72,1,.28);
 ellipse(c,1.03,.73,.4,.12,'#f1c7a0');ellipse(c,1.05,.73,.37,.20,'#e5bb96');
 c.fillStyle='#ffffff88';
 for(const [x,y,w,h] of [[.29,.737,.15,.018],[.35,.77,.28,.02],[.58,.805,.21,.005],[.43,.84,.25,.005],[.66,.88,.23,.006]]){
  c.beginPath();c.moveTo(x,y+h/2);c.lineTo(x+w*.4,y);c.lineTo(x+w*.65,y);c.lineTo(x+w,y+h/2);c.lineTo(x+w*.65,y+h);c.lineTo(x+w*.4,y+h);c.closePath();c.fill();
 }
 ellipse(c,-.16,1.15,.73,.42,'#b77873');ellipse(c,1.13,1.2,.74,.43,'#a16773');
 tree(c,.02,.68,.16,.26,'#b77873');tree(c,.19,.76,.15,.23,'#b77873');tree(c,.82,.76,.20,.30,'#a16773');
 const mist=c.createLinearGradient(0,.60,0,1);mist.addColorStop(0,'#ffffff00');mist.addColorStop(1,'#ffffff20');c.fillStyle=mist;c.fillRect(0,0,1,1);
 return canvas;
}
$('heroImport').onclick=()=>{$('pickImage').click();document.querySelector('.workspace').scrollIntoView({block:'start',behavior:'auto'});};
$('heroEditor').onclick=()=>document.querySelector('.workspace').scrollIntoView({block:'start',behavior:'auto'});
$('useLandscape').onclick=async()=>{
 const button=$('useLandscape');button.disabled=true;
 try{
  await ImageStudio.setSource({kind:'image',name:'Paisagem · pôr do sol',dataUrl:createLandscape().toDataURL('image/png')});
  ImageStudio.update({mode:'cover',zoom:1,x:0,y:0,rotation:0,flipX:false,flipY:false,brightness:100,contrast:100,saturation:100,ecg:false,text:''},false);
  document.querySelector('.workspace').scrollIntoView({block:'start',behavior:'auto'});sync();
 }catch(e){$('smartStatus').textContent='Não foi possível carregar a paisagem. '+(e.message||'Tente novamente.');}
 finally{button.disabled=false;}
};
const observer=new MutationObserver(sync);for(const id of ['statusChip','resolutionLabel'])observer.observe($(id),{childList:true,characterData:true,subtree:true});
for(const type of ['input','change'])document.addEventListener(type,()=>setTimeout(sync,0),{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
setInterval(()=>{if(!document.hidden)sync();},30000);
sync();window.LandscapeTheme={sync,createLandscape};
})();
