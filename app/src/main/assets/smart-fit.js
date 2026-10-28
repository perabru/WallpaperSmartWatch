/* Offline heuristic reframing. No upload, model, face identity or generated pixels. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function analyze(sample){
 const {width:w,height:h,data}=sample;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>65536||!data||data.length!==w*h*4)throw Error('Amostra inválida');
 const luma=new Float32Array(w*h),hist=new Uint32Array(256),weights=new Float32Array(w*h);
 let visible=0,avg=0;
 for(let i=0;i<w*h;i++){const k=i*4,L=.2126*data[k]+.7152*data[k+1]+.0722*data[k+2];luma[i]=L;if(data[k+3]>32){hist[Math.round(L)]++;visible++;avg+=L;}}
 const mean=visible?avg/visible:128;
 let total=0,cx=0,cy=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,k=i*4,a=data[k+3]/255;
  const dx=Math.abs(luma[y*w+Math.min(w-1,x+1)]-luma[y*w+Math.max(0,x-1)]);
  const dy=Math.abs(luma[Math.min(h-1,y+1)*w+x]-luma[Math.max(0,y-1)*w+x]);
  const color=Math.max(data[k],data[k+1],data[k+2])-Math.min(data[k],data[k+1],data[k+2]);
  // A small uniform prior prevents an isolated high-contrast pixel dominating the crop.
  const weight=a*(5+Math.min(90,dx+dy)*1.5+Math.abs(luma[i]-mean)*.25+color*.12);
  weights[i]=weight;total+=weight;cx+=(x+.5)/w*weight;cy+=(y+.5)/h*weight;
 }
 function percentile(q){let sum=0;for(let i=0;i<256;i++){sum+=hist[i];if(sum>=visible*q)return i;}return 128;}
 return {width:w,height:h,weights,total,cx:total?cx/total:.5,cy:total?cy/total:.5,p10:percentile(.1),p50:percentile(.5),p90:percentile(.9),visible};
}
function retention(a,d,w,h,x,y,shape){
 if(a.total<=0)return 1;
 let kept=0;
 for(let sy=0;sy<a.height;sy++)for(let sx=0;sx<a.width;sx++){
  const px=(sx+.5)/a.width*d.w+w/2-d.w/2+x*w,py=(sy+.5)/a.height*d.h+h/2-d.h/2+y*h;
  const nx=2*(px/w-.5),ny=2*(py/h-.5);
  const inside=shape==='round'?nx*nx+ny*ny<=.94*.94:Math.abs(nx)<=.97&&Math.abs(ny)<=.97;
  if(inside)kept+=a.weights[sy*a.width+sx];
 }
 return kept/a.total;
}
function plan(a,iw,ih,w,h,shape='round',strategy='balanced'){
 if(![iw,ih,w,h].every(v=>Number.isFinite(v)&&v>0))throw Error('Dimensões inválidas');
 const sc=Math.max(w/iw,h/ih),cover={w:iw*sc,h:ih*sc};
 const maxX=Math.max(0,(cover.w-w)/(2*w)),maxY=Math.max(0,(cover.h-h)/(2*h));
 const focusX=clamp((.5-a.cx)*cover.w/w,-maxX,maxX),focusY=clamp((.5-a.cy)*cover.h/h,-maxY,maxY);
 let best={x:0,y:0,retained:-1,score:-1};
 for(const k of [0,.5,1])for(const l of [0,.5,1]){
  const x=focusX*k,y=focusY*l,r=retention(a,cover,w,h,x,y,shape),score=r-.025*(Math.abs(x)+Math.abs(y));
  if(score>best.score)best={x,y,retained:r,score};
 }
 const area=w*h/(cover.w*cover.h)*(shape==='round'?Math.PI/4:1);
 const useCover=strategy==='fill'||(strategy!=='preserve'&&best.retained>=.90&&area>=.50);
 let brightness=100,contrast=100;
 // Mild correction only. Dark graphics remain dark; saturated highlights are protected.
 if(a.visible&&a.p50>12&&a.p50<70&&a.p90>70&&a.p90<215)brightness=Math.round(clamp(85/(a.p50||1)*100,100,112));
 if(a.visible&&a.p90-a.p10>20&&a.p90-a.p10<105)contrast=106;
 let zoom=1,mode='cover',x=best.x,y=best.y;
 if(!useCover){
  mode='blur';x=y=0;const s=Math.min(w/iw,h/ih),dw=iw*s,dh=ih*s;
  // Fit the full rectangle INSIDE the circle, not merely inside its bounding box.
  zoom=shape==='round'?.96/Math.hypot(dw/w,dh/h):shape==='rounded'?.94:.98;
 }
 return {patch:{mode,zoom,x,y,rotation:0,flipX:false,flipY:false,brightness,contrast,saturation:100},
  strategy:useCover?'cover':'preserve',retained:best.retained,
  message:useCover?'Preenchimento sem deformação, com foco nos detalhes.':'Imagem inteira preservada, com fundo desfocado e margem para a tela.',
  method:'local-contrast-heuristic'};
}
const api={analyze,plan,retention};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SmartFit=api;
})(typeof window!=='undefined'?window:globalThis);
