'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const C=require('../app/src/main/assets/studio-core.js');let tests=0;
function test(name,fn){fn();tests++;console.log('OK',name);}
test('options clamp, colors and shape',()=>{const o=C.options({width:1e9,height:-1,shape:'round',zoom:99,text:'a'.repeat(200),background:'javascript:bad'});assert.equal(o.width,2048);assert.equal(o.height,2048);assert.equal(o.zoom,8);assert.equal(o.text.length,120);assert.equal(o.background,'#000000');});
test('rectangle preserves independent axes',()=>assert.equal(C.options({shape:'rectangle',width:280,height:548}).height,548));
test('fit and rotated cover',()=>{assert.deepEqual(C.fit(100,200,400,400,'contain'),{w:200,h:400});assert.deepEqual(C.fit(100,200,400,400,'cover'),{w:400,h:800});const d=C.fit(100,100,400,400,'cover',45);assert.ok(Math.abs(d.w-400*Math.SQRT2)<1e-5);assert.throws(()=>C.fit(0,0,0,0,'cover'));});
test('perspective maps four corners',()=>{const corners=[[.1,.2],[.8,.1],[.9,.9],[.2,.8]],h=C.homography(corners);[[0,0],[1,0],[1,1],[0,1]].forEach((p,i)=>C.project(h,...p).forEach((n,j)=>assert.ok(Math.abs(n-corners[i][j])<1e-8)));assert.throws(()=>C.homography([[0,0],[1,1],[1,0],[0,1]]));});
let frames=[];const w=80,h=64;for(let k=0;k<10;k++){const f=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4;f[p]=x<k*5?255:0;f[p+1]=y%13===0?255:0;f[p+2]=x%19===0?255:0;f[p+3]=255;}frames.push(f);}
const encoded=C.encodeGif(frames,w,h,frames.map(()=>80));
test('GIF roundtrip, differential rectangles',()=>{assert.equal(Buffer.from(encoded.subarray(0,6)).toString(),'GIF89a');const d=C.decodeGif(encoded);assert.equal(d.frames.length,10);assert.equal(d.width,w);assert.equal(d.height,h);d.frames.forEach((f,i)=>assert.deepEqual(f,frames[i]));assert.equal(d.delays[0],80);});
test('GIF limits, corrupt and truncated input',()=>{assert.throws(()=>C.decodeGif(new Uint8Array([1,2,3])));assert.throws(()=>C.decodeGif(encoded.slice(0,120)));assert.throws(()=>C.encodeGif(frames,2000,h,[]));const d=C.decodeGif(encoded,{maxFrames:3});assert.equal(d.frames.length,3);assert.ok(d.truncated);});
fs.mkdirSync(path.join(__dirname,'../build/qa'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../build/qa/codec.gif'),encoded);fs.writeFileSync(path.join(__dirname,'../build/qa/image-core-tests.json'),JSON.stringify({passed:tests,hardwareTested:false},null,2));console.log(`${tests} core tests passed.`);
