'use strict';
const assert=require('node:assert/strict');
const S=require('../app/src/main/assets/smart-fit.js'),D=require('../app/src/main/assets/device-list.js');
let checks=0;const ok=(v,msg)=>{assert.ok(v,msg);checks++;};
function sample(w,h,f){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(f(x,y),4*(y*w+x));return{width:w,height:h,data};}
assert.throws(()=>S.analyze({width:0,height:1,data:[]}));checks++;
const a=S.analyze(sample(112,70,(x,y)=>[x>70?220:20,y>15&&y<60?100:0,40,255]));
for(const shape of ['round','rounded','rectangle','square'])for(const [iw,ih] of [[800,400],[400,800],[512,512],[2048,96]])for(const [w,h] of [[480,480],[336,480],[800,320]]){
 const p=S.plan(a,iw,ih,w,h,shape,'preserve').patch;
 ok(p.mode==='blur','preservation never stretches');
 const s=Math.min(w/iw,h/ih),dw=iw*s*p.zoom,dh=ih*s*p.zoom;
 if(shape==='round')ok((dw/w)**2+(dh/h)**2<=1.000001,'corners inside circle');
 else ok(dw<=w&&dh<=h,'image inside rectangle');
 ok(Math.abs(dw/dh-iw/ih)<1e-9,'aspect ratio');
 const q=S.plan(a,iw,ih,w,h,shape,'fill').patch;
 ok(q.mode==='cover'&&Number.isFinite(q.x)&&Number.isFinite(q.y),'fill geometry');
 ok(q.brightness>=100&&q.brightness<=112&&q.contrast<=106,'mild correction');
}
const blank=S.analyze(sample(4,4,()=>[0,0,0,0]));ok(Number.isFinite(S.plan(blank,4,4,480,480).patch.zoom),'transparent safe');
const list=D.merge([
 {id:'AA:00:00:00:00:01',name:'Headphones',audioConnected:true,systemConnected:true,classicOnly:true},
 {id:'AA:00:00:00:00:02',name:'Watch 8 Ultra',bleConnected:true,systemConnected:true,paired:true},
 {id:'AA:00:00:00:00:03',name:'Watch Call',callsConnected:true,systemConnected:true,classicOnly:true}
],[{id:'aa:00:00:00:00:02',name:'Watch 8 Ultra',rssi:-65,connectable:true}]);
ok(list.length===3,'deduplicated');ok(list[0].id==='AA:00:00:00:00:02','BLE watch preferred');ok(list[0].systemConnected,'BLE discovery preserves system status');
ok(!D.describe(list[1]).includes('undefined'),'no fictitious signal value');ok(!D.describe(list[0]).includes('compatível'),'discovery is not compatibility');
ok(D.describe({paired:true}).includes('não confirmada'),'bonded is not connected');
ok(D.merge([{id:'1',name:'Unknown',remembered:true}],[])[0].candidate,'remembered hint');
console.log(`Smart features: ${checks} checks passed. Android/Bluetooth hardware not tested.`);
