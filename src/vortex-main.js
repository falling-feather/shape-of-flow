import {VortexWorld,VORTEX_MODEL,PRESETS,ringCenter,unit,encodeVortexPlan,readVortexPlan,demonstrationPlan} from './vortex-model.js';
import {VortexRenderer} from './vortex-renderer.js';
import {explainEvolution} from './vortex-explanation.js';
import {captureObservation} from './observation-history.js';
import {LearningGuide} from './learning-guide.js';
const $=id=>document.getElementById(id),canvas=$('vortex-canvas');
const STORAGE='shape-of-flow/vortex-plan';
let renderer,world,frames=[],events=[],keyframes=[],playing=true,viewIndex=null,preset='leapfrog';
let drag=null,orbitMode=false,inputStart=null,released=null,thirdPending=null,replay=null,cursor=0;
let accumulator=0,lastTime=0,lastUI=0,toastTimer,error=null,crossings=0,lastOrder=1,ready=false;
let exportURLs=[],verification=null,viewedKey=null,learning=null;

function toast(message){clearTimeout(toastTimer);(document.querySelector('dialog[open]')||document.body).append($('vortex-toast'));$('vortex-toast').textContent=message;$('vortex-toast').hidden=false;toastTimer=setTimeout(()=>{$('vortex-toast').hidden=true;},4200);}
function observedModel(){return {...world.snapshot(),context:{inputStart:inputStart?structuredClone(inputStart):null,released:released?structuredClone(released):null,crossings}};}
function snapshot(){return {model:observedModel(),particles:renderer.readParticles()};}
function recordFrame(force=false){return captureObservation(frames,world.tick,snapshot,{force,viewIndex});}
function current(){return viewedKey?viewedKey.frame.model:viewIndex===null?observedModel():frames[viewIndex].model;}
function beginEpisode(){inputStart=world.metrics();released=null;thirdPending=null;keyframes[1]=undefined;keyframes[2]=undefined;updateKeys();}
function addEvent(event){const e={step:world.tick,...event};if(event.type==='input'&&events.at(-1)?.step===e.step&&events.at(-1)?.type==='input')events[events.length-1]=e;else events.push(e);world.apply(e);}
function applyRecordedEvent(event){
  const hadInput=Boolean(world.input);
  if(event.type==='input'&&!hadInput)beginEpisode();
  if(event.type==='release'&&hadInput&&!keyframes[1])captureKey(1,'施力',cursor-1);
  world.apply(event);
  if(event.type==='release'&&hadInput){released=world.metrics();thirdPending=world.time+.8;}
}
function captureKey(slot,label,eventCount=replay?cursor:events.length){const frame=recordFrame(true);if(!frame)throw new Error('关键时刻只能由实时演变生成。');renderer.draw(world.snapshot());const thumb=document.createElement('canvas');thumb.width=240;thumb.height=135;thumb.getContext('2d').drawImage(canvas,0,0,240,135);keyframes[slot]={tick:world.tick,label,frame,events:events.slice(0,eventCount),image:thumb.toDataURL('image/jpeg',.65)};updateKeys();}
function updateKeys(){for(let i=0;i<3;i++){const button=$(`key-${i}`),key=keyframes[i];button.disabled=!key;button.querySelector('small').textContent=key?`t = ${(key.tick*VORTEX_MODEL.dt).toFixed(2)}`:'尚未记录';if(key)button.querySelector('img').src=key.image;else button.querySelector('img').removeAttribute('src');}}
function reset(next=preset){
  if(!renderer)return;
  preset=next;world=new VortexWorld(preset);frames=[];events=[];keyframes=[];drag=null;inputStart=null;released=null;thirdPending=null;replay=null;cursor=0;viewIndex=null;viewedKey=null;error=null;crossings=0;lastOrder=1;accumulator=0;
  renderer.initialize(world);verification=renderer.verifyFirstStep(world);
  // Verification advances a disposable model; the experience still starts at t = 0.
  world=new VortexWorld(preset);renderer.initialize(world);recordFrame(true);captureKey(0,'起涡');playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;ready=true;
  $('gpu-check').textContent=`${verification.checked} 点 / 最大误差 ${verification.maximum.toExponential(2)}`;
  document.querySelectorAll('[data-preset]').forEach(button=>button.classList.toggle('active',button.dataset.preset===preset));
  $('scene-question').textContent=PRESETS[preset].subtitle;updateUI();
}
function release(record=true){
  if(!world?.input)return;
  if(!keyframes[1])captureKey(1,'施力');
  if(record)addEvent({type:'release'});else world.apply({type:'release'});
  released=world.metrics();thirdPending=world.time+.8;drag=null;$('pointer-halo').hidden=true;
  recordFrame(true);
}
function pause(){if(!ready)return;if(viewIndex!==null){playing=false;updateUI();return;}if(!replay)release();playing=false;recordFrame(true);viewIndex=frames.length-1;updateUI();}
function resume(){if(error){reset();return;}if(world.time>=VORTEX_MODEL.duration){reset();return;}if(viewIndex!==null){renderer.loadFrame(frames.at(-1),frames);viewIndex=null;viewedKey=null;}if(world.input&&!drag&&!replay)release();playing=true;accumulator=0;lastTime=performance.now();updateUI();}
function seek(index){if(!ready||!frames.length)return;pause();viewedKey=null;viewIndex=Math.max(0,Math.min(frames.length-1,index));renderer.loadFrame(frames[viewIndex],frames.slice(0,viewIndex+1));renderer.draw(frames[viewIndex].model);updateUI();}
function nearestRing(x,y){const r=canvas.getBoundingClientRect();let best=0,distance=Infinity;world.rings.forEach((ring,i)=>{const p=renderer.camera.project(ringCenter(ring),r.width,r.height);const d=Math.hypot(p.x-x,p.y-y);if(d<distance){distance=d;best=i;}});return best;}
function startInput(x,y,keyboard=false,strain=false){
  if(!playing||replay||error){toast(replay?'正在重放已记录的输入。': '先继续演变，再输入旋转或拉伸。');return;}
  const r=canvas.getBoundingClientRect(),ring=nearestRing(x,y),point=renderer.camera.planePoint(x,y,r.width,r.height),center=ringCenter(world.rings[ring]);
  beginEpisode();recordFrame(true);
  drag={x,y,lastX:x,lastY:y,point,center,ring,keyboard};released=null;thirdPending=null;
  addEvent({type:'input',ring,power:Number($('power').value),axis:[1,0,0],center,strain:strain?0.35:0});
  $('pointer-halo').hidden=keyboard;$('pointer-halo').style.left=`${x}px`;$('pointer-halo').style.top=`${y}px`;updateUI();
}
function updateUI(){if(!ready)return;const model=current(),m=model.metrics,explain=explainEvolution(model,{maxCirculation:VORTEX_MODEL.maxCirculation,error,preset});$('phase-index').textContent=explain.index;$('phase-title').textContent=explain.title;$('phase-description').textContent=explain.text;$('phase-evidence').textContent=explain.evidence;
  $('metric-gamma').textContent=m.circulation.toFixed(2);$('metric-length').textContent=m.length.toFixed(2);$('metric-core').textContent=m.core.toFixed(3);
  $('input-state').textContent=error?'计算停止':replay?'方案重放':viewIndex!==null?(model.input?'回看：输入中':'回看：输入已停止'):model.input?'正在输入':'外部输入已停止';$('input-state').classList.toggle('live',Boolean(model.input));
  $('play-button').textContent=playing?'Ⅱ':'▶';$('play-button').setAttribute('aria-label',error?'重置实验':playing?'暂停演变':'继续演变');
  $('record-time').textContent=`${m.time.toFixed(2)} / ${VORTEX_MODEL.duration.toFixed(0)} t`;$('history-slider').max=Math.max(0,frames.length-1);$('history-slider').value=viewIndex??Math.max(0,frames.length-1);$('history-slider').disabled=frames.length<2;
  $('view-state').textContent=viewIndex===null?'LIVE · 模型实时演变':`回看 · t ${m.time.toFixed(2)}`;
  $('save-vortex').disabled=Boolean(error)||m.tick<2||Boolean(replay);$('detail-time').textContent=`${m.time.toFixed(3)} t`;$('detail-peak').textContent=m.peak.toFixed(2);$('detail-loops').textContent=String(model.rings.length);
  $('skeleton').checked=renderer.skeleton;$('power-value').textContent=Number($('power').value).toFixed(1);
  $('demo-vortex').disabled=Boolean(replay);$('demo-vortex').textContent=replay?'方案重放中':'三步演变示范';
  const labels=document.querySelectorAll('.ring-label'),rect=canvas.getBoundingClientRect();model.rings.forEach((ring,i)=>{const point=renderer.camera.project(ringCenter(ring),rect.width,rect.height);labels[i].hidden=!point.visible;labels[i].style.left=`${point.x}px`;labels[i].style.top=`${point.y}px`;labels[i].classList.toggle('selected',model.input?.ring===i);});for(let i=model.rings.length;i<labels.length;i++)labels[i].hidden=true;
  const recent=frames.filter(f=>f.model.tick<=m.tick).slice(-120);if(recent.length>1){const maxL=Math.max(...recent.map(f=>f.model.metrics.length)),maxA=Math.max(...recent.map(f=>f.model.metrics.core));$('length-curve').setAttribute('points',recent.map((f,i)=>`${i/(recent.length-1)*180},${49-f.model.metrics.length/maxL*43}`).join(' '));$('core-curve').setAttribute('points',recent.map((f,i)=>`${i/(recent.length-1)*180},${49-f.model.metrics.core/maxA*43}`).join(' '));}
  learning?.observe();
}
function evolutionStep(){
  if(replay){while(replay.events[cursor]?.step===world.tick)applyRecordedEvent(replay.events[cursor++]);}
  const fields=world.step();renderer.step(world,fields);recordFrame();
  const m=world.metrics();if(m.centers.length===2&&preset==='leapfrog'){const sign=Math.sign(m.centers[1][2]-m.centers[0][2]);if(sign&&sign!==lastOrder)crossings++;if(sign)lastOrder=sign;}
  if(world.input&&inputStart&&world.time-inputStart.time>.6&&(!keyframes[1]||world.tick-keyframes[1].tick>40))captureKey(1,'施力');
  if(thirdPending!==null&&world.time>=thirdPending){captureKey(2,'余流');thirdPending=null;}
  if(replay&&world.tick>=replay.tick){while(replay.events[cursor]?.step===world.tick)applyRecordedEvent(replay.events[cursor++]);replay=null;playing=false;recordFrame(true);viewIndex=frames.length-1;toast('方案已重放到保存时刻。');return;}
  if(world.time>=VORTEX_MODEL.duration){release();playing=false;recordFrame(true);viewIndex=frames.length-1;toast('这一段演变已记录。可以回看，或留下作品。');}
}
function animate(now){if(!ready)return;const elapsed=Math.min(.07,(now-(lastTime||now))/1000),wasPlaying=playing;lastTime=now;let count=0;
  if(playing&&!error){accumulator+=elapsed;try{while(accumulator>=VORTEX_MODEL.dt&&count<4&&playing){evolutionStep();accumulator-=VORTEX_MODEL.dt;count++;}if(accumulator>.12)accumulator=.12;}catch(e){error=e.message;playing=false;world.apply({type:'release'});if(frames.length){viewIndex=frames.length-1;renderer.loadFrame(frames.at(-1),frames);}updateUI();}}
  const model=current(),observation={family:'ring',model};if(learning)renderer.camera.frame=learning.compose(renderer.camera,observation);
  renderer.draw(model);learning?.drawOverlay(renderer.camera,observation);learning?.frame(now,{active:wasPlaying,visible:document.visibilityState==='visible',focused:document.hasFocus(),drawn:renderer.lastDrawResult.drawn,submissionMs:renderer.lastDrawResult.submissionMs,steps:count});
  if(now-lastUI>90){updateUI();lastUI=now;}requestAnimationFrame(animate);
}

canvas.oncontextmenu=e=>e.preventDefault();
canvas.onpointerdown=e=>{if(!ready)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;canvas.setPointerCapture(e.pointerId);canvas.focus();if(e.button===2||orbitMode||learning?.active){if(drag&&!drag.orbit)release();drag={orbit:true,lastX:x,lastY:y};return;}startInput(x,y);};
canvas.onpointermove=e=>{if(!drag||!ready)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(drag.orbit){renderer.camera.orbit(x-drag.lastX,y-drag.lastY);drag.lastX=x;drag.lastY=y;renderer.draw(current());return;}
  const point=renderer.camera.planePoint(x,y,r.width,r.height),delta=point.map((v,i)=>v-drag.point[i]),length=Math.hypot(...delta);
  addEvent({type:'input',ring:drag.ring,power:Number($('power').value),axis:unit(delta),center:drag.center,strain:Math.min(VORTEX_MODEL.maxStrain,length*.3)});
  $('pointer-halo').style.left=`${e.clientX}px`;$('pointer-halo').style.top=`${e.clientY}px`;
};
canvas.onpointerup=()=>{if(drag?.orbit){drag=null;return;}if(drag)release();updateUI();};canvas.onpointercancel=()=>{if(drag&&!drag.orbit)release();drag=null;};
canvas.addEventListener('wheel',e=>{e.preventDefault();renderer?.camera.zoom(e.deltaY);renderer?.draw(current());},{passive:false});
canvas.onkeydown=e=>{if(!ready)return;if(learning?.active&&(e.key==='Enter'||e.key.toLowerCase()==='r'||(e.key===' '&&!learning.pending))){e.preventDefault();return;}if(e.key==='Enter'&&!e.repeat){e.preventDefault();const r=canvas.getBoundingClientRect();startInput(r.width*.56,r.height*.5,true,e.shiftKey);}else if(e.key===' '){e.preventDefault();playing?pause():resume();}else if(e.key.startsWith('Arrow')){e.preventDefault();renderer.camera.orbit(e.key==='ArrowLeft'?-15:e.key==='ArrowRight'?15:0,e.key==='ArrowUp'?-15:e.key==='ArrowDown'?15:0);}else if(e.key.toLowerCase()==='r')reset();};
canvas.onkeyup=e=>{if(e.key==='Enter'&&drag?.keyboard)release();};window.addEventListener('blur',()=>{if(ready&&drag&&!drag.orbit)release();drag=null;});
$('play-button').onclick=()=>playing?pause():resume();$('reset-vortex').onclick=()=>reset();$('orbit-button').onclick=()=>{orbitMode=!orbitMode;$('orbit-button').classList.toggle('active',orbitMode);$('orbit-button').setAttribute('aria-pressed',String(orbitMode));canvas.classList.toggle('orbit',orbitMode);};
$('demo-vortex').onclick=()=>importPlan(JSON.stringify(demonstrationPlan()));
$('history-slider').oninput=e=>seek(Number(e.target.value));$('power').oninput=()=>updateUI();
document.querySelectorAll('[data-preset]').forEach(button=>{button.onclick=()=>reset(button.dataset.preset);});
for(let i=0;i<3;i++)$(`key-${i}`).onclick=()=>{const key=keyframes[i];if(!key)return;pause();let index=frames.findIndex(f=>f.model.tick>=key.tick);viewIndex=index<0?frames.length-1:index;viewedKey=key;renderer.loadFrame(key.frame,[...frames.filter(f=>f.model.tick<key.tick),key.frame]);renderer.draw(key.frame.model);updateUI();};
$('model-button').onclick=()=>{updateUI();$('model-dialog').showModal();};$('skeleton').onchange=e=>{renderer.skeleton=e.target.checked;renderer.draw(current());};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
$('load-vortex').onclick=()=>{$('import-error').textContent='';$('load-dialog').showModal();};
function importPlan(text){try{const plan=readVortexPlan(text);$('load-dialog').close();reset(plan.preset);Object.assign(renderer.camera,plan.view);renderer.skeleton=plan.view.skeleton;events=plan.events.map(e=>structuredClone(e));replay=plan;cursor=0;playing=true;
  frames=[];recordFrame(true);keyframes=[];captureKey(0,'起涡');updateUI();
  if(plan.tick===0){while(plan.events[cursor]?.step===0)applyRecordedEvent(plan.events[cursor++]);playing=false;replay=null;recordFrame(true);viewIndex=frames.length-1;updateUI();}
}catch(e){$('import-error').textContent=e.message;}}
$('import-vortex').onclick=()=>importPlan($('import-json').value);
$('restore-vortex').onclick=()=>{try{const text=localStorage.getItem(STORAGE);if(!text){$('import-error').textContent='这台浏览器还没有保存的三维方案。';return;}importPlan(text);}catch{$('import-error').textContent='无法读取本机保存，请载入 JSON。';}};
$('import-file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>1000000){$('import-error').textContent='文件不能超过 1 MB。';return;}try{$('import-json').value=await f.text();}catch{$('import-error').textContent='文件读取失败。';}};
let exportPlan=null;
$('save-vortex').onclick=()=>{if(!ready||error)return;if(playing)pause();const frame=current(),view={azimuth:renderer.camera.azimuth,elevation:renderer.camera.elevation,distance:renderer.camera.distance,skeleton:renderer.skeleton};
  exportPlan={...encodeVortexPlan(preset,(viewedKey?viewedKey.events:events).filter(e=>e.step<=frame.tick),frame.tick,view),artworkId:`VORTEX-${Date.now().toString(36).toUpperCase()}`};
  renderer.draw(frame);const out=$('export-preview');out.width=canvas.width;out.height=canvas.height+120;const ctx=out.getContext('2d');ctx.fillStyle='#030a10';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(canvas,0,0);ctx.fillStyle='#e7dcc5';ctx.font=`${Math.max(16,out.width/65)}px "SimSun",serif`;ctx.fillText(`涡的形状 / ${PRESETS[preset].title} / t ${frame.time.toFixed(2)}`,30,out.height-75);ctx.font=`${Math.max(10,out.width/120)}px "Segoe UI","Microsoft YaHei",sans-serif`;ctx.fillStyle='#94aaa9';ctx.fillText(`${exportPlan.artworkId} · 三维规则化涡丝近似 · Γ ${frame.metrics.circulation.toFixed(2)} · L ${frame.metrics.length.toFixed(2)} · a ${frame.metrics.core.toFixed(3)}`,30,out.height-35);
  exportURLs.forEach(URL.revokeObjectURL);exportURLs=[];const json=JSON.stringify(exportPlan,null,2);$('export-json').value=json;$('export-image').removeAttribute('href');$('export-image').textContent='图像准备中…';
  out.toBlob(blob=>{if(!blob){toast('图像编码失败。');return;}const url=URL.createObjectURL(blob);exportURLs.push(url);$('export-image').href=url;$('export-image').download=`${exportPlan.artworkId}.png`;$('export-image').textContent='导出图像 PNG';},'image/png');
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));exportURLs.push(url);$('export-plan').href=url;$('export-plan').download=`${exportPlan.artworkId}.json`;$('save-title').textContent=`t = ${frame.time.toFixed(2)} · ${exportPlan.artworkId}`;$('save-dialog').showModal();
};
$('remember-vortex').onclick=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(exportPlan));toast('三维方案已在这台浏览器保存。');}catch{toast('本机保存不可用，请导出 JSON。');}};
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();playing=false;error='图形上下文已丢失，请重新载入页面，再载入此前保存的方案。';$('fatal').hidden=false;$('fatal-message').textContent=error;});
window.addEventListener('resize',()=>{if(ready){renderer.resize();renderer.draw(current());updateUI();}});
try{renderer=new VortexRenderer(canvas);reset();learning=new LearningGuide({family:'ring',snapshot:()=>({family:'ring',model:current(),view:{azimuth:renderer.camera.azimuth,elevation:renderer.camera.elevation,distance:renderer.camera.distance,skeleton:renderer.skeleton}}),run:plan=>importPlan(JSON.stringify(plan)),running:()=>playing,pause,resume,formula:()=>$('model-button').click(),conditions:()=>{$('power').focus();toast('旋转输入强度在画场下方。');},artwork:()=>$('save-vortex').click(),load:()=>$('load-vortex').click(),label:()=>`涡环 / ${preset}`,device:()=>({...renderer.deviceInfo(),renderPath:'WebGL2 涡环示踪'})});if(!learning.active&&!matchMedia('(prefers-reduced-motion: reduce)').matches)importPlan(JSON.stringify(demonstrationPlan()));requestAnimationFrame(animate);}catch(e){$('fatal').hidden=false;$('fatal-message').textContent=e.message;$('input-state').textContent='图形初始化未完成';}
