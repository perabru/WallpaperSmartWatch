/* Renderer do mostrador. Formato de projeto próprio; não é um pacote MActive Pro. */
(function (global) {
  'use strict';
  const portrait = new Image(); portrait.src = 'jill-portrait.png';
  const DEFAULT = Object.freeze({name:'Raccoon Inventory',shape:'round',accent:'#43ff49',showSeconds:true,timeFormat:'24',dateLocale:'en',width:512,height:512});
  const SEGMENTS={0:'abcedf',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgecd',7:'abc',8:'abcdefg',9:'abfgcd'};
  function poly(c,points,color){c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fill();}
  function text(c,str,x,y,size,color,font='monospace',align='left'){c.fillStyle=color;c.font=`bold ${size}px ${font}`;c.textAlign=align;c.textBaseline='alphabetic';c.fillText(str,x,y);}
  function panel(c,x,y,w,h,bg='#080e37',thin=false){
    c.fillStyle='#020617';c.fillRect(x-2,y-2,w+5,h+5);
    const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#edf3f3');g.addColorStop(.24,'#8c9bb0');g.addColorStop(.52,'#d5dce5');g.addColorStop(.74,'#6e7e9d');g.addColorStop(1,'#d8e0eb');
    c.fillStyle=g;c.fillRect(x,y,w,h);c.strokeStyle='#f9faff';c.lineWidth=1;c.strokeRect(x+1,y+1,w-2,h-2);
    const b=thin?4:7;c.fillStyle='#343a62';c.fillRect(x+b-2,y+b-2,w-b*2+4,h-b*2+4);c.fillStyle=bg;c.fillRect(x+b,y+b,w-b*2,h-b*2);
  }
  function gun(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);poly(c,[[4,7],[68,7],[70,15],[57,22],[66,52],[50,56],[40,29],[25,27],[22,19],[4,19]],'#1e1a2c');poly(c,[[4,6],[66,6],[72,11],[67,19],[22,20],[18,15],[4,15]],'#a2aab4');c.fillStyle='#e2e6e9';c.fillRect(8,7,55,4);c.fillStyle='#4b566c';c.fillRect(19,14,44,5);poly(c,[[44,22],[55,21],[64,49],[52,51]],'#876047');c.fillStyle='#c49a66';c.fillRect(53,27,5,18);c.strokeStyle='#a3a5b5';c.lineWidth=3;c.strokeRect(29,20,16,10);c.fillStyle='#f4de8e';c.fillRect(5,8,3,4);c.restore();}
  function bottle(c,x,y,color,s=1){c.save();c.translate(x,y);c.scale(s,s);c.fillStyle='#cdd8dd';c.fillRect(6,0,9,4);c.fillStyle='#a2b7c8';c.fillRect(5,4,11,5);c.fillStyle=color;c.fillRect(2,9,17,25);c.fillStyle='#f2f2db';c.fillRect(3,18,15,10);c.fillStyle='#ffffffa6';c.fillRect(4,11,3,19);c.fillStyle='#476e87';c.fillRect(1,33,19,3);c.restore();}
  function ammo(c,x,y){c.save();c.translate(x,y);poly(c,[[0,7],[24,1],[31,8],[6,15]],'#efe5af');poly(c,[[6,15],[31,8],[31,23],[6,30]],'#b23426');poly(c,[[0,7],[6,15],[6,30],[0,23]],'#7b2c26');c.fillStyle='#e8cc8e';c.fillRect(11,13,16,8);text(c,'9',18,20,7,'#433127');c.restore();}
  function key(c,x,y){c.save();c.translate(x,y);c.rotate(.7);c.strokeStyle='#c5d1e6';c.lineWidth=6;c.beginPath();c.arc(0,0,6,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(0,7);c.lineTo(0,27);c.lineTo(7,27);c.moveTo(0,20);c.lineTo(7,20);c.stroke();c.restore();}
  function star(c,x,y,r1,r2,color){const p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5;const r=i%2?r2:r1;p.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}poly(c,p,color);}
  function badge(c,x,y){c.save();c.translate(x,y);c.fillStyle='#101956';c.strokeStyle='#d6deef';c.lineWidth=3;c.beginPath();c.arc(0,0,31,0,Math.PI*2);c.fill();c.stroke();c.beginPath();c.arc(0,4,23,0,Math.PI*2);c.stroke();text(c,'S.T.A.R.S.',0,-16,12,'#eef2ef','serif','center');star(c,0,4,15,6,'#f1e66e');text(c,'RACCOON',0,25,7,'#dde7ff','monospace','center');c.restore();}
  function wifi(c,x,y,accent){c.save();c.translate(x,y);c.strokeStyle=accent;c.globalAlpha=.65;c.lineWidth=2;for(let r=10;r<=35;r+=9){c.beginPath();c.arc(0,0,r,Math.PI*1.15,Math.PI*1.85);c.stroke();}c.fillStyle=accent;c.fillRect(-2,-3,4,4);c.restore();}
  function digit(c,char,x,y,w,h,color){
    if(char===':'){c.fillStyle=color;c.fillRect(x+w*.36,y+h*.28,w*.3,w*.3);c.fillRect(x+w*.36,y+h*.7,w*.3,w*.3);return;}
    const t=w*.15,l=t*.65;const a=SEGMENTS[char]||'';const mid=h/2;
    const shapes={a:[[l,0],[w-l,0],[w-t,t],[t,t]],g:[[t,mid-t/2],[w-t,mid-t/2],[w-l,mid],[w-t,mid+t/2],[t,mid+t/2],[l,mid]],d:[[t,h-t],[w-t,h-t],[w-l,h],[l,h]],f:[[0,l],[t,t],[t,mid-t],[0,mid-l]],b:[[w-t,t],[w,l],[w,mid-l],[w-t,mid-t]],e:[[0,mid+l],[t,mid+t],[t,h-t],[0,h-l]],c:[[w-t,mid+t],[w,mid+l],[w,h-l],[w-t,h-t]]};
    c.save();c.translate(x,y);for(const s of a)poly(c,shapes[s],color);c.restore();
  }
  function digital(c,str,x,y,w,h,color){const units=[...str].reduce((n,ch)=>n+(ch===':'?.44:1),0);const gap=5;const dw=(w-gap*(str.length-1))/units;for(const ch of str){const cw=ch===':'?dw*.44:dw;digit(c,ch,x,y,cw,h,color);x+=cw+gap;}}
  function normalize(v={}){v=v&&typeof v==='object'&&!Array.isArray(v)?v:{};const dim=x=>{const n=typeof x==='number'||typeof x==='string'?Number(x):NaN;return Number.isFinite(n)?Math.max(128,Math.min(2048,Math.round(n))):512;};return {name:typeof v.name==='string'?v.name.trim().slice(0,48)||DEFAULT.name:DEFAULT.name,shape:v.shape==='rounded'?'rounded':'round',accent:typeof v.accent==='string'&&/^#[a-f0-9]{6}$/i.test(v.accent)?v.accent:DEFAULT.accent,showSeconds:v.showSeconds!==false,timeFormat:v.timeFormat==='12'?'12':'24',dateLocale:v.dateLocale==='pt'?'pt':'en',width:dim(v.width),height:dim(v.height)};}
  function draw(canvas,config={},options={}){
    const cfg=normalize({...DEFAULT,...config}),c=canvas.getContext('2d'); const W=512,H=cfg.shape==='rounded'?627:512,dy=cfg.shape==='rounded'?49:0;
    const scale=Math.min(canvas.width/W,canvas.height/H);c.clearRect(0,0,canvas.width,canvas.height);c.fillStyle='#010316';c.fillRect(0,0,canvas.width,canvas.height);c.save();c.translate((canvas.width-W*scale)/2,(canvas.height-H*scale)/2);c.scale(scale,scale);
    c.beginPath();if(cfg.shape==='round')c.arc(256,256,255,0,Math.PI*2);else{c.moveTo(60,0);c.arcTo(512,0,512,627,60);c.arcTo(512,627,0,627,60);c.arcTo(0,627,0,0,60);c.arcTo(0,0,512,0,60);}c.closePath();c.clip();
    const bg=c.createLinearGradient(0,0,512,H);bg.addColorStop(0,'#020722');bg.addColorStop(.55,'#060630');bg.addColorStop(1,'#020617');c.fillStyle=bg;c.fillRect(0,0,W,H);
    c.fillStyle='#bbc6d9';poly(c,[[104,65+dy],[168,33+dy],[342,33+dy],[412,65+dy]],'#bac7d5');panel(c,169,25+dy,173,36,'#06111e',true);text(c,'--',256,49+dy,16,'#de5446','monospace','center');
    if(cfg.shape==='rounded'){text(c,'S.T.A.R.S. PERSONAL TERMINAL',256,30,10,'#94a8bd','monospace','center');text(c,'RACCOON CITY / UNIT 01',256,604,10,'#8391a7','monospace','center');}
    c.strokeStyle='#8698b1';c.lineWidth=4;c.beginPath();c.moveTo(202,193+dy);c.lineTo(202,229+dy);c.lineTo(337,229+dy);c.lineTo(337,194+dy);c.moveTo(136,310+dy);c.lineTo(399,310+dy);c.stroke();
    panel(c,133,87+dy,242,117,'#1713b5');c.fillStyle='#5c6a8a';c.fillRect(141,95+dy,20,101);c.save();c.translate(156,188+dy);c.rotate(-Math.PI/2);text(c,'EQUIP',0,0,20,'#e7edeb','serif');c.restore();
    c.fillStyle='#a7c0ca';c.fillRect(168,95+dy,195,7);c.fillStyle='#139741';c.fillRect(171,96+dy,77,3);c.fillRect(280,96+dy,79,3);c.fillStyle='#ee6474';for(let i=0;i<3;i++)c.fillRect(254+i*8,96+dy,3,3);
    gun(c,222,110+dy,1.15);text(c,'92/100',174,187+dy,24,cfg.accent);badge(c,84,159+dy);wifi(c,420,153+dy,cfg.accent);
    panel(c,388,182+dy,80,169,'#1713b5',true);c.strokeStyle='#7079d0';c.lineWidth=1;c.beginPath();c.moveTo(428,189+dy);c.lineTo(428,343+dy);for(let y=238;y<335;y+=51){c.moveTo(394,y+dy);c.lineTo(461,y+dy);}c.stroke();gun(c,395,193+dy,.40);bottle(c,436,191+dy,'#d9c66f',.8);text(c,'15',395,233+dy,12,cfg.accent);bottle(c,401,244+dy,'#a4dfdf',.78);ammo(c,431,242+dy);text(c,'30',436,285+dy,12,cfg.accent);key(c,417,306+dy);bottle(c,437,302+dy,'#d53c5d',.72);
    panel(c,44,260+dy,107,99,'#1913b4',true);c.fillStyle='#050a1b';c.fillRect(50,265+dy,95,19);text(c,'JILL',98,280+dy,17,'#eeeeda','serif','center');
    if(portrait.complete&&portrait.naturalWidth){c.save();c.imageSmoothingEnabled=false;const sh=portrait.naturalWidth*67/95;const sy=Math.max(0,(portrait.naturalHeight-sh)*.25);c.drawImage(portrait,0,sy,portrait.naturalWidth,sh,50,286+dy,95,67);c.restore();}else{c.fillStyle='#223dc1';c.fillRect(50,286+dy,95,67);text(c,'JILL',98,323+dy,15,'#e0e8ff','monospace','center');}
    panel(c,166,241+dy,210,88,'#02150c');c.save();c.beginPath();c.rect(174,249+dy,194,72);c.clip();c.strokeStyle='#0c4229';c.lineWidth=.7;for(let y=252;y<=320;y+=5){c.beginPath();c.moveTo(174,y+dy);c.lineTo(368,y+dy);c.stroke();}
    c.strokeStyle=cfg.accent;c.lineWidth=3;c.shadowColor=cfg.accent;c.shadowBlur=5;c.beginPath();let wave=[[176,291],[210,291],[222,288],[231,291],[240,260],[250,298],[259,286],[271,274],[285,289],[301,291],[363,291]];wave.forEach((p,i)=>i?c.lineTo(p[0],p[1]+dy):c.moveTo(p[0],p[1]+dy));c.stroke();c.shadowBlur=0;text(c,'Fine',270,314+dy,22,cfg.accent,'monospace','center');c.restore();text(c,'CONDITION',177,344+dy,17,'#ccd6df','serif');text(c,'-- BPM',375,354+dy,16,cfg.accent,'monospace','right');
    const timeY=cfg.shape==='rounded'?439:371;panel(c,66,timeY,380,76,'#030720');const d=options.date||new Date();let hour=d.getHours();if(cfg.timeFormat==='12')hour=hour%12||12;const pad=n=>String(n).padStart(2,'0');const timestr=pad(hour)+':'+pad(d.getMinutes())+(cfg.showSeconds?':'+pad(d.getSeconds()):'');
    if(!options.backgroundOnly){const digitsW=cfg.showSeconds?286:205;digital(c,timestr,256-digitsW/2,timeY+12,digitsW,53,'#f2f5ff');}
    const dateY=cfg.shape==='rounded'?541:459;panel(c,154,dateY,204,31,'#06111c',true);
    if(!options.backgroundOnly){const days=cfg.dateLocale==='pt'?['DOM','SEG','TER','QUA','QUI','SEX','SAB']:['SUN','MON','TUE','WED','THU','FRI','SAT'];const months=cfg.dateLocale==='pt'?['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];text(c,days[d.getDay()]+' '+months[d.getMonth()]+' '+pad(d.getDate()),256,dateY+22,18,cfg.accent,'monospace','center');}
    c.fillStyle='#ffffff03';for(let y=0;y<H;y+=3)c.fillRect(0,y,W,1);c.restore();
  }
  function exportPng(config,backgroundOnly=true,deviceSize=null){const cfg=normalize(config);const c=document.createElement('canvas');const valid=deviceSize&&Number.isInteger(deviceSize.width)&&Number.isInteger(deviceSize.height)&&deviceSize.width>=64&&deviceSize.height>=64&&deviceSize.width<=1024&&deviceSize.height<=1024;c.width=valid?deviceSize.width:cfg.width;c.height=valid?deviceSize.height:cfg.height;draw(c,cfg,{backgroundOnly});return c.toDataURL('image/png');}
  global.RaccoonFace={DEFAULT,normalize,draw,exportPng,portrait,version:'2.0.0'};
})(window);
