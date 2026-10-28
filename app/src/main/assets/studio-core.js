/* Raccoon Studio — deterministic image geometry and animated GIF codec. MIT. */
(function(root){
'use strict';
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,Number.isFinite(+v)?+v:lo));
const defaults={name:'Meu mostrador',shape:'round',width:480,height:480,mode:'cover',zoom:1,x:0,y:0,rotation:0,flipX:false,flipY:false,brightness:100,contrast:100,saturation:100,background:'#000000',transparent:false,clock:false,clockY:.79,clockColor:'#ffffff',text:'',textY:.18,textSize:7,textColor:'#ffffff',ecg:false,ecgX:.34,ecgY:.49,ecgW:.38,ecgH:.11,ecgColor:'#43ff49',ecgBackground:'#02150c',ecgSpeed:1,gifSeconds:2,gifFps:12};
function options(v={}){
 const o={...defaults};if(!v||typeof v!=='object'||Array.isArray(v))return o;
 for(const k of ['name','text'])if(typeof v[k]==='string')o[k]=v[k].slice(0,k==='name'?60:120);
 for(const k of ['flipX','flipY','transparent','clock','ecg'])o[k]=v[k]===true;
 for(const k of ['background','clockColor','textColor','ecgColor','ecgBackground'])if(/^#[\da-f]{6}$/i.test(v[k]))o[k]=v[k];
 for(const [k,a,b] of [['width',64,2048],['height',64,2048],['zoom',.1,8],['x',-2,2],['y',-2,2],['rotation',-180,180],['brightness',0,200],['contrast',0,200],['saturation',0,200],['clockY',.05,.95],['textY',.05,.95],['textSize',2,20],['ecgX',0,.95],['ecgY',0,.95],['ecgW',.05,1],['ecgH',.02,.5],['ecgSpeed',.25,3],['gifSeconds',1,5],['gifFps',5,20]])if(v[k]!=null)o[k]=clamp(v[k],a,b);
 o.width=Math.round(o.width);o.height=Math.round(o.height);
 if(['round','square','rounded','rectangle'].includes(v.shape))o.shape=v.shape;
 if(['cover','contain','stretch','blur'].includes(v.mode))o.mode=v.mode;
 if(o.shape==='round'||o.shape==='square')o.height=o.width;
 o.ecgW=Math.min(o.ecgW,1-o.ecgX);o.ecgH=Math.min(o.ecgH,1-o.ecgY);
 return o;
}
function fit(iw,ih,w,h,mode,rotation=0){
 if(![iw,ih,w,h].every(n=>Number.isFinite(n)&&n>0))throw Error('Dimensões inválidas');
 if(mode==='stretch')return {w,h};
 const r=rotation*Math.PI/180,co=Math.abs(Math.cos(r)),si=Math.abs(Math.sin(r));
 const scale=mode==='cover'?Math.max((w*co+h*si)/iw,(w*si+h*co)/ih):Math.min(w/(iw*co+ih*si),h/(iw*si+ih*co));
 return {w:iw*scale,h:ih*scale};
}
// Homography: output unit square to source quadrilateral (TL, TR, BR, BL).
function homography(p){
 if(!Array.isArray(p)||p.length!==4||p.some(v=>!Array.isArray(v)||v.length!==2||v.some(x=>!Number.isFinite(x))))throw Error('Marque quatro cantos válidos');
 let sign=0,area=0;
 for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4],c=p[(i+2)%4];const z=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(Math.abs(z)<1e-6||sign&&Math.sign(z)!==sign)throw Error('Os cantos não podem se cruzar');sign=Math.sign(z);area+=a[0]*b[1]-b[0]*a[1];}
 if(Math.abs(area)<1e-5)throw Error('Área selecionada muito pequena');
 const [a,b,c,d]=p,dx1=b[0]-c[0],dx2=d[0]-c[0],dx3=a[0]-b[0]+c[0]-d[0],dy1=b[1]-c[1],dy2=d[1]-c[1],dy3=a[1]-b[1]+c[1]-d[1];
 let g=0,h=0;
 if(Math.abs(dx3)+Math.abs(dy3)>1e-10){let det=dx1*dy2-dx2*dy1;if(Math.abs(det)<1e-10)throw Error('Perspectiva inválida');g=(dx3*dy2-dx2*dy3)/det;h=(dx1*dy3-dx3*dy1)/det;}
 return [b[0]-a[0]+g*b[0],d[0]-a[0]+h*d[0],a[0],b[1]-a[1]+g*b[1],d[1]-a[1]+h*d[1],a[1],g,h];
}
function project(m,x,y){const z=m[6]*x+m[7]*y+1;return[(m[0]*x+m[1]*y+m[2])/z,(m[3]*x+m[4]*y+m[5])/z];}
function palette332(){const p=new Uint8Array(768);for(let n=0;n<256;n++){p[3*n]=Math.round((n>>5)*255/7);p[3*n+1]=Math.round(((n>>2)&7)*255/7);p[3*n+2]=(n&3)*85;}return p;}
function indexed332(rgba){const a=new Uint8Array(rgba.length/4);for(let i=0,j=0;i<rgba.length;i+=4,j++)a[j]=((rgba[i]>>5)<<5)|((rgba[i+1]>>5)<<2)|(rgba[i+2]>>6);return a;}
// GIF89a. Small fixed-code LZW blocks avoid dictionary ambiguity across readers.
// Only changed rectangles are stored; ECG-only files remain compact.
function encodeGif(frames,w,h,delays){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>1024||h>1024||!frames.length||frames.length>120)throw Error('GIF fora dos limites de exportação');
 const out=[],byte=n=>out.push(n&255),word=n=>{byte(n);byte(n>>8);},ascii=s=>{for(const c of s)byte(c.charCodeAt(0));};
 ascii('GIF89a');word(w);word(h);byte(0xf7);byte(0);byte(0);for(const v of palette332())byte(v);
 out.push(0x21,0xff,11);ascii('NETSCAPE2.0');out.push(3,1,0,0,0);
 let prev=null;
 frames.forEach((frame,k)=>{
  if(frame.length!==w*h*4)throw Error('Quadro GIF inválido');const px=indexed332(frame);let x0=0,y0=0,x1=w-1,y1=h-1;
  if(prev){x0=w;y0=h;x1=-1;y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(px[y*w+x]!==prev[y*w+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}if(x1<0){x0=y0=x1=y1=0;}}
  const rw=x1-x0+1,rh=y1-y0+1;out.push(0x21,0xf9,4,4);word(clamp(Math.round((delays[k]||80)/10),2,65535));out.push(0,0,0x2c);word(x0);word(y0);word(rw);word(rh);byte(0);byte(8);
  let bits=0,acc=0,block=[],count=0;const flush=()=>{if(block.length){byte(block.length);for(const n of block)byte(n);block=[];}};const emit=c=>{acc|=c<<bits;bits+=9;while(bits>=8){block.push(acc&255);acc>>>=8;bits-=8;if(block.length===255)flush();}};
  emit(256);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){if(count===250){emit(256);count=0;}emit(px[y*w+x]);count++;}emit(257);if(bits)block.push(acc&255);flush();byte(0);prev=px;
 });byte(0x3b);return new Uint8Array(out);
}
function decodeGif(bytes,{maxFrames=90,maxPixels=24000000}={}){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let pos=0;
 const take=n=>{if(pos+n>b.length)throw Error('GIF incompleto');const r=b.subarray(pos,pos+n);pos+=n;return r;},u8=()=>take(1)[0],u16=()=>{const a=take(2);return a[0]|a[1]<<8;};
 const sig=String.fromCharCode(...take(6));if(sig!=='GIF89a'&&sig!=='GIF87a')throw Error('GIF inválido');
 const width=u16(),height=u16(),packed=u8(),bg=u8();u8();if(!width||!height||width*height>4194304)throw Error('GIF muito grande (máximo de 4 milhões de pixels por quadro)');
 const globalTable=packed&128?take(3*(1<<((packed&7)+1))):null;const screen=new Uint8ClampedArray(width*height*4),frames=[],delays=[];let gce={disposal:0,delay:100,transparent:-1},last=null;
 const blocks=()=>{let parts=[],len=0;while(true){const n=u8();if(!n)break;const a=take(n);parts.push(a);len+=n;if(len>40000000)throw Error('GIF grande demais');}const all=new Uint8Array(len);let i=0;for(const a of parts){all.set(a,i);i+=a.length;}return all;};
 function lzw(data,min,expected){if(min<2||min>8)throw Error('Compressão GIF inválida');const clear=1<<min,end=clear+1;let bits=min+1,next=end+1,bit=0,old=-1,first=0,o=0,dictP=new Int16Array(4096),dictS=new Uint8Array(4096),stack=new Uint8Array(4096),output=new Uint8Array(expected);for(let i=0;i<clear;i++)dictS[i]=i;
 const code=()=>{if(bit+bits>data.length*8)return -1;let n=0;for(let i=0;i<bits;i++)n|=((data[(bit+i)>>3]>>((bit+i)&7))&1)<<i;bit+=bits;return n;};
 while(o<expected){let c=code();if(c<0||c===end)break;if(c===clear){bits=min+1;next=end+1;old=-1;continue;}if(c>next||c>=4096)throw Error('Dados GIF corrompidos');const original=c;let sp=0;if(c===next){if(old<0)throw Error('Dicionário GIF inválido');stack[sp++]=first;c=old;}while(c>=clear){if(c>=next||sp>=4095)throw Error('Dicionário GIF inválido');stack[sp++]=dictS[c];c=dictP[c];}first=dictS[c];stack[sp++]=first;while(sp&&o<expected)output[o++]=stack[--sp];if(old>=0&&next<4096){dictP[next]=old;dictS[next]=first;next++;if(next===(1<<bits)&&bits<12)bits++;}old=original;}
 if(o<expected)throw Error('Quadro GIF incompleto');return output;}
 let truncated=false;
 while(pos<b.length){const type=u8();if(type===0x3b)break;
  if(type===0x21){const label=u8();if(label===0xf9){if(u8()!==4)throw Error('GIF inválido');const p=u8(),d=u16(),t=u8();u8();gce={disposal:(p>>2)&7,delay:Math.max(20,d*10||100),transparent:p&1?t:-1};}else blocks();continue;}
  if(type!==0x2c)throw Error('Bloco GIF inválido');
  if(frames.length>=maxFrames||(frames.length+1)*width*height>maxPixels){truncated=true;break;}
  if(last){if(last.disposal===2){for(let y=last.y;y<last.y+last.h;y++)for(let x=last.x;x<last.x+last.w;x++){const i=(y*width+x)*4;if(last.transparent<0&&globalTable){screen[i]=globalTable[bg*3];screen[i+1]=globalTable[bg*3+1];screen[i+2]=globalTable[bg*3+2];screen[i+3]=255;}else screen.fill(0,i,i+4);}}else if(last.disposal===3&&last.restore)screen.set(last.restore);}
  if(!frames.length&&gce.transparent<0&&globalTable){for(let i=0;i<screen.length;i+=4){screen[i]=globalTable[bg*3];screen[i+1]=globalTable[bg*3+1];screen[i+2]=globalTable[bg*3+2];screen[i+3]=255;}}
  const x=u16(),y=u16(),w=u16(),h=u16(),p=u8();if(!w||!h||x+w>width||y+h>height)throw Error('Quadro fora da imagem');const table=p&128?take(3*(1<<((p&7)+1))):globalTable;if(!table)throw Error('Paleta GIF ausente');const min=u8(),indices=lzw(blocks(),min,w*h);const restore=gce.disposal===3?screen.slice():null;
  let rows=[];if(p&64){for(const[start,step]of[[0,8],[4,8],[2,4],[1,2]])for(let r=start;r<h;r+=step)rows.push(r);}else for(let r=0;r<h;r++)rows.push(r);
  for(let r=0;r<h;r++)for(let q=0;q<w;q++){const v=indices[r*w+q];if(v===gce.transparent)continue;if(v*3+2>=table.length)throw Error('Paleta GIF inválida');const o=((y+rows[r])*width+x+q)*4;screen[o]=table[v*3];screen[o+1]=table[v*3+1];screen[o+2]=table[v*3+2];screen[o+3]=255;}
  frames.push(screen.slice());delays.push(gce.delay);last={...gce,x,y,w,h,restore};gce={disposal:0,delay:100,transparent:-1};
 }
 if(!frames.length)throw Error('Nenhum quadro no GIF');return{width,height,frames,delays,truncated};
}
const api={clamp,defaults,options,fit,homography,project,encodeGif,decodeGif};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WatchCore=api;
})(typeof window==='undefined'?globalThis:window);
