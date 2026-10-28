/* Ranking is a UI hint only. Native authentication/capability checks still gate writes. */
(function(root){
'use strict';
function merge(known=[],nearby=[]){
 const m=new Map();for(const d of known)if(d&&typeof d.id==='string')m.set(d.id.toUpperCase(),{...d,id:d.id.toUpperCase()});
 for(const d of nearby){if(!d||typeof d.id!=='string')continue;const id=d.id.toUpperCase(),old=m.get(id)||{};
  m.set(id,{...old,...d,id,name:d.name&&d.name!=='Dispositivo sem nome'?d.name:old.name||d.name,nearby:true,classicOnly:false});}
 return [...m.values()].map(d=>{
  const candidate=d.candidate===true||d.remembered===true||d.wristClass===true||/(watch|mactive|microwear|ultra|rel[oó]gio)/i.test(d.name||'');
  const priority=(d.remembered?1000:0)+(candidate?200:0)+(d.bleConnected?100:0)+(d.systemConnected?50:0)+(d.paired?10:0)+(d.classicOnly?-250:0);
  return {...d,candidate,priority};
 }).sort((a,b)=>b.priority-a.priority||(Number.isFinite(b.rssi)?b.rssi:-200)-(Number.isFinite(a.rssi)?a.rssi:-200)||(a.name||'').localeCompare(b.name||''));
}
function describe(d){
 const parts=[];
 if(d.bleConnected)parts.push('Conectado ao celular · dados BLE');
 else if(d.callsConnected||d.audioConnected)parts.push('Conectado ao celular · chamadas/áudio');
 else if(d.systemConnected)parts.push('Conectado ao celular');
 else if(d.paired)parts.push('Pareado · conexão não confirmada');
 else parts.push('Encontrado nas proximidades');
 if(d.remembered)parts.push('Escolhido anteriormente');
 else if(d.candidate)parts.push('Possível relógio');
 if(d.classicOnly)parts.push('Somente Bluetooth clássico: procure o canal BLE');
 if(Number.isFinite(d.rssi))parts.push(d.rssi+' dBm');
 return parts.join(' · ');
}
const api={merge,describe};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DeviceList=api;
})(typeof window!=='undefined'?window:globalThis);
