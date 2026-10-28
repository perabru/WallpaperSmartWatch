(function(){
  'use strict';
  const $=id=>document.getElementById(id);const native=typeof window.Android!=='undefined';
  const CFG_KEY='raccoon.current.v1',CAT_KEY='raccoon.catalog.v1';
  let config=loadConfig(),catalog=loadCatalog(),page='faces',scanning=false,connected=false,connecting=false,report=null,nativeInfo={},capabilities={},transfer={state:'idle'},transferBusy=false,toastTimer;
  function readStore(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v==null?fallback:v;}catch(e){return fallback;}}
  function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){toast('O armazenamento local está cheio. Exporte suas versões antes de continuar.');return false;}}
  function loadConfig(){return RaccoonFace.normalize(readStore(CFG_KEY,RaccoonFace.DEFAULT));}
  function loadCatalog(){const stored=readStore(CAT_KEY,null);if(Array.isArray(stored))return stored.slice(0,32).filter(x=>x&&typeof x.id==='string').map(x=>({id:x.id.slice(0,80),createdAt:typeof x.createdAt==='string'?x.createdAt:new Date().toISOString(),config:RaccoonFace.normalize(x.config)}));return [{id:'inventory-original',createdAt:new Date().toISOString(),config:{...RaccoonFace.DEFAULT}}];}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4300);}
  function go(tab){page=['faces','editor','device'].includes(tab)?tab:'faces';document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===page));window.scrollTo(0,0);renderFace();}
  window.navigateTo=go;
  document.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>go(x.dataset.tab)));
  $('editFace').onclick=()=>go('editor');$('openDevice').onclick=$('connectionChip').onclick=()=>go('device');
  function renderFace(){const h=config.shape==='rounded'?627:512;for(const id of ['faceCanvas','editorCanvas']){const c=$(id);if(c.height!==h)c.height=h;RaccoonFace.draw(c,config);}const rounded=config.shape==='rounded';$('watchCase').classList.toggle('rounded',rounded);$('heroShape').textContent=rounded?'RETANGULAR':'REDONDO';$('editorCanvas').style.aspectRatio=rounded?'512 / 627':'1';$('editorCanvas').style.borderRadius=rounded?'20%':'50%';$('currentFaceName').textContent=config.name;renderSendPreview();}
  function syncFields(){ $('faceName').value=config.name;$('accentColor').value=config.accent;$('showSeconds').checked=config.showSeconds;$('timeFormat').value=config.timeFormat;$('dateLocale').value=config.dateLocale;$('exportWidth').value=config.width;$('exportHeight').value=config.height;document.querySelectorAll('[data-shape]').forEach(x=>x.classList.toggle('selected',x.dataset.shape===config.shape));document.querySelectorAll('[data-accent]').forEach(x=>x.classList.toggle('selected',x.dataset.accent===config.accent));const names={'#43ff49':'VERDE CLÁSSICO','#59deff':'AZUL GELO','#ffbd4a':'ÂMBAR','#ff71c6':'ROSA'};$('accentLabel').textContent=names[config.accent]||'PERSONALIZADO';}
  function update(patch){config=RaccoonFace.normalize({...config,...patch});writeStore(CFG_KEY,config);syncFields();renderFace();}
  $('faceName').addEventListener('change',e=>update({name:e.target.value}));$('showSeconds').addEventListener('change',e=>update({showSeconds:e.target.checked}));$('timeFormat').addEventListener('change',e=>update({timeFormat:e.target.value}));$('dateLocale').addEventListener('change',e=>update({dateLocale:e.target.value}));$('accentColor').addEventListener('input',e=>update({accent:e.target.value}));
  document.querySelectorAll('[data-shape]').forEach(x=>x.onclick=()=>update({shape:x.dataset.shape,width:512,height:x.dataset.shape==='rounded'?627:512}));
  document.querySelectorAll('[data-accent]').forEach(x=>x.onclick=()=>update({accent:x.dataset.accent}));
  for(const [id,key] of [['exportWidth','width'],['exportHeight','height']])$(id).addEventListener('change',e=>update({[key]:e.target.value}));
  function id(){return 'face-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);}
  function save(){if(catalog.length>=32){toast('Limite de 32 versões. Exporte ou remova uma versão antes de publicar outra.');return;}const next={id:id(),createdAt:new Date().toISOString(),config:{...config}};const updated=[next,...catalog];if(!writeStore(CAT_KEY,updated))return;catalog=updated;renderCatalog();toast('Versão publicada no catálogo deste celular.');}
  $('saveCurrent').onclick=$('saveEditor').onclick=save;
  function thumbnail(cfg){const c=document.createElement('canvas');c.width=128;c.height=cfg.shape==='rounded'?157:128;RaccoonFace.draw(c,cfg,{date:new Date(2026,9,28,9,52,18)});return c.toDataURL('image/png');}
  function renderCatalog(){const root=$('catalog');root.replaceChildren();if(!catalog.length){const p=document.createElement('p');p.className='section-note';p.textContent='Seu catálogo está vazio. Publique a versão atual para começar.';root.append(p);return;}for(const item of catalog){const row=document.createElement('article');row.className='catalog-item';const img=new Image();img.src=thumbnail(item.config);img.alt='Prévia de '+item.config.name;const info=document.createElement('div');const title=document.createElement('strong');title.textContent=item.config.name;const small=document.createElement('small');const date=new Date(item.createdAt);small.textContent=(item.config.shape==='round'?'Redondo':'Retangular')+' · '+(isNaN(date)?'Local':date.toLocaleDateString('pt-BR'))+' · Local';info.append(title,small);const use=document.createElement('button');use.textContent='Abrir ↗';use.onclick=()=>{update(item.config);go('editor');};const remove=document.createElement('button');remove.className='remove';remove.textContent='×';remove.setAttribute('aria-label','Remover '+item.config.name);remove.onclick=()=>confirmRemove(item.id,item.config.name);row.append(img,info,use,remove);root.append(row);}}
  function confirmRemove(id,name){const dialog=$('confirmDialog');$('dialogTitle').textContent='Remover esta versão?';$('dialogMessage').textContent='“'+name+'” será removido do catálogo local. Arquivos exportados continuam disponíveis.';$('dialogCancel').onclick=()=>dialog.close();$('dialogConfirm').onclick=()=>{const next=catalog.filter(x=>x.id!==id);if(writeStore(CAT_KEY,next)){catalog=next;renderCatalog();}dialog.close();};dialog.showModal();}
  function slug(){return config.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'raccoon-inventory';}
  function base64Utf8(text){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
  function exportFile(name,mime,base64){if(native){Android.exportFile(name,mime,base64);return;}const binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const url=URL.createObjectURL(new Blob([bytes],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Arquivo preparado para download.');}
  $('exportBackground').onclick=()=>{exportFile(slug()+'-fundo.png','image/png',RaccoonFace.exportPng(config,true).split(',')[1]);};
  function project(){return {format:'raccoon-studio/project',schemaVersion:1,createdAt:new Date().toISOString(),name:config.name,config:{...config},compatibility:{targetLabel:'Watch 8 Ultra / MActive Pro',status:'checked_on_connection',transferMode:'custom_background',watchfaceBinary:false},note:'Projeto editável do Raccoon Studio. Não é um arquivo instalável de mostrador. O envio Bluetooth usa o fundo; a hora e a data são desenhadas pelo mostrador do relógio.'};}
  $('exportProject').onclick=()=>exportFile(slug()+'.raccoon.json','application/json',base64Utf8(JSON.stringify(project(),null,2)));
  function importProject(value){if(!value||value.format!=='raccoon-studio/project'||value.schemaVersion!==1||!value.config||typeof value.config!=='object'||Array.isArray(value.config)){toast('Este arquivo não é um projeto Raccoon Studio versão 1.');return;}update(value.config);go('editor');toast('Projeto importado. Publique uma versão para guardá-lo no catálogo.');}
  $('importProject').onclick=()=>native?Android.importProject():$('projectFileInput').click();
  $('projectFileInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(file.size>1000000){toast('O projeto deve ter até 1 MB.');e.target.value='';return;}try{importProject(JSON.parse(await file.text()));}catch(error){toast('Não foi possível ler esse JSON.');}e.target.value='';});
  if(!native){$('browserNotice').classList.remove('hidden');$('scanButton').textContent='Bluetooth no APK';}
  $('scanButton').onclick=()=>{if(!native){toast('Instale o APK para conectar ao relógio. Esta prévia mantém o editor disponível.');return;}if(scanning)Android.stopScan();else Android.startScan();};
  $('disconnectButton').onclick=()=>native&&Android.disconnect();
  $('showLicenses').onclick=()=>{if(native&&typeof Android.showLicenses==='function')Android.showLicenses();else toast('Licenças e créditos estão em THIRD_PARTY_NOTICES no repositório WallpaperSmartWatch.');};
  const BUSY_STATES=new Set(['preparing','converting','transferring','uploading','activating','verifying','cancelling']);
  const COMPLETE_STATES=new Set(['complete','success']);
  function isReady(){return connected&&capabilities.ready===true&&capabilities.transferEnabled===true;}
  function detectedSize(){const w=Number(capabilities.screenWidth),h=Number(capabilities.screenHeight);return Number.isInteger(w)&&Number.isInteger(h)&&w>=64&&h>=64&&w<=1024&&h<=1024?{width:w,height:h}:null;}
  function renderSendPreview(){if(transferBusy)return;const c=$('sendCanvas');c.height=config.shape==='rounded'?235:192;RaccoonFace.draw(c,config,{backgroundOnly:true});c.style.borderRadius=config.shape==='rounded'?'20%':'50%';$('sendFaceName').textContent=config.name;const size=detectedSize();$('sendDimensions').textContent=size?size.width+' × '+size.height+' px · do relógio':'Resolução automática';}
  function refreshTransferControls(){
    const ready=isReady();$('sendFace').disabled=!ready||transferBusy;$('sendFace').setAttribute('aria-disabled',String(!ready||transferBusy));
    $('sendFace').textContent=transferBusy?'Envio em andamento…':ready?'Enviar fundo para o relógio ↗':'Conecte um relógio compatível';
    $('cancelTransfer').classList.toggle('hidden',!transferBusy);$('cancelTransfer').disabled=['activating','verifying','cancelling'].includes(transfer.state);
    $('disconnectButton').disabled=transferBusy||(!connected&&!connecting);
    $('transferCard').classList.toggle('ready',ready);$('transferCard').classList.toggle('failed',['error','blocked'].includes(transfer.state));
    if(transferBusy){$('transferBadge').textContent='EM ANDAMENTO';return;}
    $('transferBadge').textContent=COMPLETE_STATES.has(transfer.state)?'APLICADO':transfer.state==='error'?'TENTE NOVAMENTE':ready?'PRONTO':'CONECTE';
    $('transferBadge').classList.toggle('ready-tag',ready);$('transferBadge').classList.toggle('amber-tag',!ready);
  }
  function renderCapabilities(data){
    capabilities=data&&typeof data==='object'?{...data}:{};
    const ready=isReady();
    const pending=connected&&!ready&&['','unverified','preparing_transport','authenticating','initializing','protocol_initializing'].includes(capabilities.status||'');
    $('profileBadge').textContent=ready?'COMPATÍVEL':!connected?'AGUARDANDO':pending?'VERIFICANDO':'NÃO LIBERADO';
    $('profileBadge').classList.toggle('ready-tag',ready);
    $('homeConnectionTitle').textContent=ready?'Relógio pronto para receber':'Leve o design para o relógio';
    $('homeConnectionDescription').textContent=ready?'Fundo personalizado disponível. Abra a transmissão para enviar a versão atual.':'Conecte o relógio para verificar o envio de fundo personalizado e usar a resolução informada por ele.';
    if(!transferBusy&&!COMPLETE_STATES.has(transfer.state))$('transferExplanation').textContent=capabilities.message||(ready?'Conexão verificada. O app converterá o fundo para o formato aceito pelo relógio.':'Conecte o relógio. O envio será liberado quando o aparelho confirmar suporte a fundo personalizado.');
    if(ready)$('deviceState').textContent='Compatível com envio de fundo personalizado.';
    refreshTransferControls();renderSendPreview();
  }
  function renderTransfer(data){
    transfer={...data};transferBusy=BUSY_STATES.has(transfer.state);
    const complete=COMPLETE_STATES.has(transfer.state),failed=['error','blocked'].includes(transfer.state);
    $('transferExplanation').textContent=data.message||(complete?'Fundo aplicado ao mostrador do relógio.':failed?'O envio não foi concluído.':'Processando o fundo…');
    $('transferProgress').classList.toggle('hidden',!transferBusy&&!complete);
    const stages={preparing:'Preparando imagem',converting:'Convertendo imagem',transferring:'Enviando por Bluetooth',uploading:'Enviando por Bluetooth',activating:'Aplicando no relógio',verifying:'Confirmando aplicação',cancelling:'Cancelando',complete:'Aplicação confirmada',success:'Aplicação confirmada'};
    $('transferStage').textContent=stages[data.state]||'Envio';
    // 100% of transmitted bytes is not installation success. Completion comes from the native callback.
    if(complete){$('transferBar').value=100;$('transferPercent').textContent='100%';}
    else if(Number.isFinite(data.progress)&&['transferring','uploading'].includes(data.state)){const progress=Math.max(0,Math.min(100,data.progress));$('transferBar').value=progress;$('transferPercent').textContent=Math.round(progress)+'%';}
    else{$('transferBar').removeAttribute('value');$('transferPercent').textContent='—';}
    refreshTransferControls();
    if(complete||failed||data.state==='cancelled')toast($('transferExplanation').textContent);
  }
  $('sendFace').onclick=()=>{
    if(!native||!isReady()||transferBusy)return;
    if(typeof Android.installBackground!=='function'){toast('Atualize o APK para habilitar o envio de fundos.');return;}
    try{
      renderSendPreview();
      const size=detectedSize();
      if(!size){toast('O relógio ainda não informou uma resolução válida. Reconecte para tentar novamente.');return;}
      const image=RaccoonFace.exportPng(config,true,size);
      renderTransfer({state:'preparing',message:'Verificando o mostrador atual e preparando a imagem…'});
      Android.installBackground(image);
    }catch(error){renderTransfer({state:'error',message:'Não foi possível preparar a imagem. Tente novamente.'});}
  };
  $('cancelTransfer').onclick=()=>{
    if(!native||!transferBusy||$('cancelTransfer').disabled)return;
    Android.cancelTransfer();
  };
  function syncConnectionControls(){$('scanButton').disabled=connected||connecting;$('scanButton').textContent=scanning?'Parar busca':native?'Buscar relógios':'Bluetooth no APK';$('disconnectButton').disabled=!connected&&!connecting;$('disconnectButton').textContent=connecting?'Cancelar conexão':'Desconectar';document.querySelectorAll('.device-row button').forEach(b=>b.disabled=connected||connecting||b.dataset.unavailable==='true');refreshTransferControls();}
  function deviceRows(data){scanning=!!data.scanning;const root=$('deviceList');root.replaceChildren();for(const d of data.devices||[]){const row=document.createElement('div');row.className='device-row';const info=document.createElement('div');const name=document.createElement('strong');name.textContent=d.name||'Dispositivo sem nome';const details=document.createElement('small');details.textContent=d.id;info.append(name,details);const signal=document.createElement('span');signal.className='signal';signal.textContent=d.rssi+' dBm';const button=document.createElement('button');button.textContent=d.connectable===false?'Indisponível':'Conectar';button.dataset.unavailable=String(d.connectable===false);button.onclick=()=>{connecting=true;syncConnectionControls();$('scanStatus').textContent='Conectando a '+(d.name||'relógio')+'…';Android.connect(d.id);};row.append(info,signal,button);root.append(row);}syncConnectionControls();}
  function setConnection(data){connected=data.state==='connected';connecting=false;capabilities={};if(!connected){if(transferBusy)renderTransfer({state:'error',message:'A conexão foi encerrada antes da confirmação do envio.'});capabilities={};if(!transferBusy)transfer={state:'idle'};}$('connectionChip').classList.toggle('connected',connected);$('connectionText').textContent=connected?'CONECTADO':'SEM RELÓGIO';$('deviceLed').classList.toggle('connected',connected);syncConnectionControls();$('deviceName').textContent=data.name||'Watch 8 Ultra';$('deviceState').textContent=connected?'Conectado • identificando serviços.':'Relógio desconectado.';if(connected)$('deviceList').replaceChildren();renderCapabilities(capabilities);}
  function renderReport(data){
    report=data;
    if(data.connection){connected=!!data.connection.connected;connecting=data.connection.state==='connecting';syncConnectionControls();}
    const info=data.deviceInformation||{},protocol=data.protocol||{};
    if(protocol.capabilities)renderCapabilities(protocol.capabilities);
    else if(data.capabilities)renderCapabilities(data.capabilities);
    else if(Object.prototype.hasOwnProperty.call(protocol,'transferEnabled')||Object.prototype.hasOwnProperty.call(protocol,'ready'))renderCapabilities(protocol);
    const size=detectedSize();
    const values=[['Fabricante',info.manufacturer],['Modelo',info.model],['Firmware',info.firmware||capabilities.firmwareVersion],['Hardware',info.hardware],['Software',info.software],['Resolução detectada',size?size.width+' × '+size.height+' px':null],['Serviços Bluetooth',Array.isArray(data.services)?String(data.services.length):null],['Bateria do relógio',data.battery&&Number.isFinite(data.battery.percent)?data.battery.percent+'%':null]];
    const root=$('deviceDetails');root.replaceChildren();
    for(const [label,value] of values){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value||'Não informado';row.append(dt,dd);root.append(row);}
    if(data.diagnosticsComplete&&!transferBusy&&!isReady())$('deviceState').textContent=connected?'Identificação Bluetooth concluída.':'Diagnóstico disponível nesta sessão.';
  }
  $('exportReport').onclick=()=>{if(!native){toast('O diagnóstico precisa ser coletado no aplicativo Android.');return;}let raw;try{raw=JSON.parse(Android.getReport());}catch(e){toast('Não foi possível obter o diagnóstico.');return;}if(!raw.device||!raw.device.address){toast('Conecte ao relógio antes de salvar o diagnóstico.');return;}const value={format:'raccoon-studio/ble-report',schemaVersion:2,createdAt:new Date().toISOString(),app:nativeInfo,userProvided:{model:$('manualModel').value.trim(),firmware:$('manualFirmware').value.trim(),companionApp:'MActive Pro'},diagnostic:raw};exportFile('watch8-ultra-diagnostico.json','application/json',base64Utf8(JSON.stringify(value,null,2)));};
  window.onNativeEvent=function(type,data){
    data=data||{};
    switch(type){
      case 'nativeReady':nativeInfo=data;break;
      case 'devices':deviceRows(data);break;
      case 'status':$('scanStatus').textContent=data.message||'';break;
      case 'connected':setConnection(data);break;
      case 'report':renderReport(data);break;
      case 'capabilities':renderCapabilities(data);break;
      case 'error':
        if(native){try{renderReport(JSON.parse(Android.getReport()));}catch(e){}}
        $('scanStatus').textContent=data.message||'Falha na operação.';toast(data.message||'Falha na operação.');break;
      case 'transfer':renderTransfer(data);break;
      case 'fileExport':if(data.state==='saved')toast('Salvo: '+data.name);else if(data.state==='cancelled')toast('Salvamento cancelado.');break;
      case 'projectImport':importProject(data);break;
    }
  };
  if(native){try{nativeInfo=JSON.parse(Android.getNativeInfo());}catch(e){}}
  RaccoonFace.portrait.addEventListener('load',()=>{renderFace();renderCatalog();});
  syncFields();renderFace();renderCatalog();renderCapabilities({});setInterval(()=>{if(!document.hidden&&page!=='device')renderFace();},1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderFace();});
  window.RaccoonStudio={getConfig:()=>({...config}),getProject:project,getCatalog:()=>JSON.parse(JSON.stringify(catalog)),getPage:()=>page,getTransfer:()=>({...transfer}),getCapabilities:()=>({...capabilities}),importProject,update,go};
})();
