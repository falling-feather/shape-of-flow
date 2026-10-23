import {VortexRenderer} from './vortex-renderer.js';
import {GaussianWorld,GAUSSIAN_MODEL,GAUSSIAN_DEFAULT,GAUSSIAN_PRESETS,GAUSSIAN_VIEW,gaussianState,vorticityBudget,enclosedCirculation,encodeGaussianPlan,readGaussianPlan} from './gaussian-vortex.js';
import {researchScales,RESEARCH_H,RESEARCH_WINDOW,encodeResearchPlan,readResearchPlan} from './research-scales.js';
import {ResearchDisplay} from './research-display.js';
import {explainGaussian} from './gaussian-explanation.js';
import {captureObservation} from './observation-history.js';
import {LearningGuide} from './learning-guide.js';

const $=id=>document.getElementById(id);
const canvas=$('study-canvas'),overlay=$('probe-overlay');
const storageKey='shape-of-flow/equation-card';
const parameterKeys=['strain','viscosity','gamma','initialCore'];
let renderer,researchDisplay,world,frames=[],viewIndex=null,reference=null;
let playing=true,mode='physics',activeTerm='stretch',probe=0,drag=null;
let scales=researchScales(0),follow=false,scalePlaying=false,replayTarget=null,comparisonTarget=null;
let lastTime=0,accumulator=0,lastUI=0,error=null,toastTimer,ready=false,cardPlan=null;
let verification=null,learning=null;
let needsDraw=true,lastViewStamp='';

import {scientific} from './number-format.js';

function toast(message){
  clearTimeout(toastTimer);(document.querySelector('dialog[open]')||document.body).append($('study-toast'));
  $('study-toast').textContent=message;$('study-toast').hidden=false;
  toastTimer=setTimeout(()=>{$('study-toast').hidden=true;},4200);
}

function current(){return viewIndex===null?world.snapshot():frames[viewIndex].model;}
function record(force=false){
  return captureObservation(frames,world.tick,()=>({model:world.snapshot(),particles:renderer.readParticles()}),{force,viewIndex});
}
function fillParameters(parameters){
  for(const key of parameterKeys)$(`study-${key}`).value=parameters[key];
  parameterLabels();
}
function proposedParameters(){return Object.fromEntries(parameterKeys.map(key=>[key,Number($(`study-${key}`).value)]));}
function parameterLabels(){
  for(const key of parameterKeys)$(`${key}-value`).textContent=Number($(`study-${key}`).value).toFixed(key==='viscosity'||key==='initialCore'?3:key==='strain'?2:1);
  $('parameters-pending').hidden=!world||parameterKeys.every(key=>Math.abs(Number($(`study-${key}`).value)-world.parameters[key])<1e-8);
}
function closeConditions(){document.body.classList.remove('panel-open');$('toggle-conditions').setAttribute('aria-expanded','false');}

function reset(parameters=world?.parameters||GAUSSIAN_DEFAULT,{autoplay=true}={}){
  world=new GaussianWorld(parameters);renderer.initialize(world);
  verification=renderer.verifyTransport(world,60);
  world=new GaussianWorld(parameters);renderer.initialize(world);
  frames=[];viewIndex=null;replayTarget=null;comparisonTarget=reference?.tick??null;accumulator=0;error=null;
  record(true);playing=autoplay&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(comparisonTarget===0)playing=false;
  fillParameters(parameters);ready=true;
  $('study-gpu-check').textContent=`${verification.steps} 步 / ${verification.checked} 点 / 位置 ${verification.maximum.toExponential(2)} / 径向 ${verification.radialMaximum.toExponential(2)} / 轴向 ${verification.axialMaximum.toExponential(2)}`;
  document.querySelectorAll('[data-gaussian]').forEach(button=>button.classList.toggle('active',parameterKeys.every(key=>Math.abs(GAUSSIAN_PRESETS[button.dataset.gaussian].parameters[key]-parameters[key])<1e-8)));
  updateUI();
}

function pause(){
  if(!ready)return;
  if(mode==='research'){scalePlaying=false;updateUI();return;}
  if(viewIndex!==null){playing=false;updateUI();return;}
  playing=false;record(true);if(viewIndex===null)viewIndex=frames.length-1;updateUI();
}
function resume(){
  if(mode==='research'){if(scales.decades>=6)scales=researchScales(0);scalePlaying=true;updateUI();return;}
  if(error){toast('请先重置实验。');return;}
  if(world.time>=GAUSSIAN_MODEL.duration){reset();return;}
  if(viewIndex!==null){renderer.loadFrame(frames.at(-1),frames);viewIndex=null;}
  comparisonTarget=null;playing=true;accumulator=0;lastTime=performance.now();updateUI();
}
function seek(index){
  pause();viewIndex=Math.max(0,Math.min(frames.length-1,index));
  renderer.loadFrame(frames[viewIndex],frames.slice(0,viewIndex+1));renderer.draw(current());updateUI();
}
function setMode(next){
  if(!ready)return;
  if(mode==='physics')pause();else scalePlaying=false;
  mode=next;closeConditions();
  $('physics-room').hidden=next!=='physics';$('research-room').hidden=next!=='research';
  $('study-canvas').style.opacity=next==='physics'?'1':'0';$('scale-canvas').hidden=next!=='research';
  $('probe-overlay').hidden=next!=='physics';$('history-control').hidden=next!=='physics';
  canvas.setAttribute('aria-label',next==='physics'?'三维解析涡流。拖动或方向键转动视角，滚轮缩放，空格暂停。':'反例核心的三维几何包络。拖动转动视角，使用尺度滑杆改变观察窗口。');
  for(const name of ['physics','research']){$(`room-${name}`).classList.toggle('active',next===name);$(`room-${name}`).setAttribute('aria-pressed',String(next===name));}
  $('toggle-conditions').textContent=next==='physics'?'调节条件':'尺度数据';
  if(next==='physics'){renderer.loadFrame(viewIndex===null?frames.at(-1):frames[viewIndex],viewIndex===null?frames:frames.slice(0,viewIndex+1));renderer.draw(current());}
  updateUI();
}

function profile(model){
  const state=model.state,a=model.metrics.core;
  const old=reference?gaussianState(reference.parameters,reference.tick*GAUSSIAN_MODEL.dt):null;
  const extent=Math.max(1.2,a*2.2,probe+.1,old?Math.sqrt(old.core2)*2.2:0);
  const peak=Math.max(model.metrics.peak,old?old.gamma/(Math.PI*old.core2):0);
  const path=s=>Array.from({length:97},(_,i)=>{const r=i/96*extent,omega=s.gamma/(Math.PI*s.core2)*Math.exp(-r*r/s.core2);return `${i?'L':'M'}${(16+i/96*236).toFixed(2)} ${(84-omega/peak*66).toFixed(2)}`;}).join(' ');
  const line=path(state);$('profile-line').setAttribute('d',line);$('profile-area').setAttribute('d',`${line} L252 84 L16 84Z`);
  $('profile-max').textContent=`ω ${peak.toFixed(2)}`;$('profile-legend').textContent=reference?'青线：当前剖面；铜虚线：对照 A。横纵坐标共用。':'青线：由当前解析状态计算的涡量剖面。';
  $('reference-profile').setAttribute('d',old?path(old):'');
  const px=16+probe/extent*236;$('probe-line').setAttribute('x1',px);$('probe-line').setAttribute('x2',px);
  $('profile-extent').textContent=`${extent.toFixed(1)} r`;
}

function updatePhysics(){
  const model=current(),m=model.metrics,state=model.state,budget=vorticityBudget(probe,state),p=model.parameters;
  $('stat-one-label').textContent='涡核宽度 a';$('stat-two-label').textContent='峰值涡量 ω₀';$('stat-three-label').textContent='保持的环量 Γ';
  $('stat-one').textContent=m.core.toFixed(3);$('stat-two').textContent=m.peak.toFixed(2);$('stat-three').textContent=m.circulation.toFixed(2);
  $('scene-caption').textContent='解析速度场中的真实输运 · 无量纲';
  $('study-time').textContent=`${m.time.toFixed(2)} / 20 t`;
  $('study-history').max=Math.max(0,frames.length-1);$('study-history').value=viewIndex??frames.length-1;$('study-history').disabled=frames.length<2;
  $('current-view').textContent=replayTarget!==null?'方案重放中':viewIndex===null?'LIVE · 真实输运':`回看 · t ${m.time.toFixed(2)}`;
  const explanation=explainGaussian(model);
  $('study-phase').textContent=explanation.phase;$('study-heading').textContent=explanation.heading;$('study-description').textContent=explanation.description;$('study-evidence').textContent=explanation.evidence;
  $('active-parameters').textContent=`当前 α ${p.strain.toFixed(2)} · ν ${p.viscosity.toFixed(3)} · a₀ ${p.initialCore.toFixed(3)}；改条件从初态重算。`;
  $('probe-value').textContent=probe.toFixed(2);$('study-probe').value=probe;
  $('budget-location').textContent=probe===0?'探针：涡核轴心':`探针：r = ${probe.toFixed(2)}`;
  const termScale=Math.max(...['transport','stretch','diffusion'].map(key=>Math.abs(budget[key]))),maximum=Math.max(1e-9,termScale);
  for(const key of ['transport','stretch','diffusion']){$(`budget-${key}`).textContent=scientific(budget[key]);$(`bar-${key}`).style.width=`${Math.abs(budget[key])/maximum*82}%`;}
  $('budget-net').textContent=budget.net===0||Math.abs(budget.net)<termScale*1e-12?'≈0':scientific(budget.net);
  const descriptions={transport:'输运：流体把涡量带到别处。这里显示固定探针处由流动造成的局部变化。',stretch:'拉伸：沿涡轴拉长流体，使旋转集中；大小为 αω。是否净增强还要看其余项。',diffusion:'扩散：黏性重新分配涡量。核心区通常减弱，外侧也可能获得从内部扩散而来的涡量。'};
  $('term-explanation').textContent=descriptions[activeTerm];
  $('probe-reading').textContent=`此处 ω ${scientific(budget.omega)}；圆内环量 ${enclosedCirculation(probe,state).toFixed(3)}。a 为涡量降到轴心 1/e 的半径。`;
  $('formula-values').textContent=`t = ${m.time.toFixed(3)}；s = ${m.core2.toFixed(6)}；4ν − αs = ${m.coreRate.toFixed(6)}；ω₀ = ${m.peak.toFixed(5)}。`;
  $('comparison-result').hidden=!reference;$('clear-comparison').hidden=!reference;
  if(reference){
    const old=gaussianState(reference.parameters,reference.tick*GAUSSIAN_MODEL.dt);
    $('comparison-result').textContent=m.tick===reference.tick?`同刻对照 t ${(reference.tick*GAUSSIAN_MODEL.dt).toFixed(2)}：a 较 A ${((m.core/Math.sqrt(old.core2)-1)*100).toFixed(1)}%。A：α ${old.strain.toFixed(2)}，ν ${old.viscosity.toFixed(3)}，Γ ${old.gamma.toFixed(1)}，a₀ ${old.initialCore.toFixed(3)}。`:`A 已记录在 t ${(reference.tick*GAUSSIAN_MODEL.dt).toFixed(2)}。应用新条件时自动停在同刻；当前时刻不同，暂不作差。`;
  }
  profile(model);parameterLabels();
}

function updateResearch(){
  $('research-window-note').textContent=`固定示意窗口 X = ${RESEARCH_WINDOW.X}、|η| ≤ ${RESEARCH_WINDOW.etaMax}；它不是论文完整速度剖面的数值边界。`;
  $('research-power-note').textContent=`铜线：速度；青线：核心能量。比例系数取 1，示例 h = ${RESEARCH_H}。图示为渐近标度，不能作为全域总能量数值。`;
  $('stat-one-label').textContent='相对纤细度 ℓ𝓏/ℓᵣ';$('stat-two-label').textContent='核心体积标度';$('stat-three-label').textContent='示例指数 h';
  $('stat-one').textContent=scales.aspect.toFixed(3);$('stat-two').textContent=scientific(scales.volume);$('stat-three').textContent=RESEARCH_H.toFixed(3);
  for(const key of ['radial','axial','speed'])$(`scale-${key}`).textContent=scientific(scales[key]);
  $('scale-energy').textContent=scientific(scales.coreEnergy);$('scale-tau').textContent=`τ = ${scientific(scales.tau)}`;
  $('scale-slider').value=scales.decades;
  $('scale-evidence').textContent=`径向 ${scientific(scales.radial)} · 轴向 ${scientific(scales.axial)} · 相对纤细度 ${scales.aspect.toFixed(3)}`;
  $('study-time').textContent=`${scales.decades.toFixed(2)} / 6 阶`;
  $('current-view').textContent='论文代表幂律 · 比例系数取 1';$('scene-caption').textContent='尺度几何示意 · 不表示完整反例速度场';
  const curve=power=>Array.from({length:61},(_,i)=>{const d=i/10,logValue=-d*power;return `${i?'L':'M'}${22+d/6*230} ${61-logValue/3.1*47}`;}).join(' ');
  $('scale-speed-curve').setAttribute('d',curve(-.5-RESEARCH_H));$('scale-energy-curve').setAttribute('d',curve(.5-3*RESEARCH_H));
  const x=22+scales.decades/6*230;$('scale-cursor').setAttribute('x1',x);$('scale-cursor').setAttribute('x2',x);
  $('scale-fit').setAttribute('aria-pressed',String(follow));$('scale-fit').textContent=`跟随尺度观察 · ${follow?'开':'关'}`;
  $('scale-camera-note').textContent=follow?`跟随镜头相对初始放大 ${(1/scales.axial).toFixed(1)} 倍；标尺保留原坐标单位。`:'固定镜头。缩得太小时，可打开跟随观察；数字始终保留原尺度。';
}

function updateUI(){
  if(!ready)return;
  needsDraw=true;
  mode==='physics'?updatePhysics():updateResearch();
  const running=mode==='physics'?playing:scalePlaying;
  $('display-semantics').textContent=mode==='physics'?'青绿 → 铜橙：涡量 0—≥40（对数色阶）':'铜线：核心几何包络 · 图中铜/青曲线：速度/核心能量';
  $('study-play').textContent=running?'Ⅱ':'▶';$('study-play').setAttribute('aria-label',running?'暂停演变':'继续演变');
  $('study-save').disabled=Boolean(error)||(mode==='physics'&&replayTarget!==null);
  learning?.observe();
}

function drawProbe(){
  const rect=overlay.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5),width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
  if(overlay.width!==width||overlay.height!==height){overlay.width=width;overlay.height=height;}
  const ctx=overlay.getContext('2d');ctx.clearRect(0,0,width,height);
  const matrix=renderer.camera.matrix(width,height);
  ctx.strokeStyle='#89ceca80';ctx.lineWidth=.8*ratio;ctx.setLineDash([3*ratio,5*ratio]);ctx.beginPath();
  for(let i=0;i<=96;i++){const angle=i/96*Math.PI*2,point=renderer.camera.project([probe*Math.cos(angle),0,probe*Math.sin(angle)],width,height,matrix);i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y);}
  ctx.stroke();ctx.setLineDash([]);
  if(probe===0){const point=renderer.camera.project([0,0,0],width,height,matrix);ctx.strokeRect(point.x-3*ratio,point.y-3*ratio,6*ratio,6*ratio);}
}

function step(){
  const fields=world.step();renderer.step(world,fields);record();
  if(world.tick===replayTarget||world.tick===comparisonTarget||world.time>=GAUSSIAN_MODEL.duration){
    const wasReplay=replayTarget!==null;playing=false;replayTarget=null;comparisonTarget=null;record(true);viewIndex=frames.length-1;
    toast(wasReplay?'已按原条件重放到保存时刻。':reference?'已到达对照 A 的相同观察时刻。':'这一场演变已经记录，可以回看与比较。');
    updateUI();
  }
}
function animate(now){
  if(!ready)return;
  const elapsed=Math.min(.07,(now-(lastTime||now))/1000);lastTime=now;
  renderer.camera.frame=learning?learning.compose(renderer.camera,mode==='physics'?{family:'gaussian',model:current()}:{family:'scales'}):innerHeight>innerWidth*1.4?{x:0,y:.28,scale:1.25}:{x:.12,y:.17,scale:1.4};
  const running=mode==='physics'?playing:scalePlaying;
  let steps=0,drawn=false,submissionMs=0;
  try{
    if(mode==='physics'){
      if(playing&&!error){accumulator+=elapsed;while(accumulator>=GAUSSIAN_MODEL.dt&&steps<4&&playing){step();accumulator-=GAUSSIAN_MODEL.dt;steps++;}if(accumulator>.12)accumulator=.12;}
    }else{
      if(scalePlaying){scales=researchScales(Math.min(6,scales.decades+elapsed*.35));if(scales.decades>=6){scalePlaying=false;updateUI();}}
    }
    const frame=renderer.camera.frame,stamp=[innerWidth,innerHeight,devicePixelRatio,renderer.camera.azimuth,renderer.camera.elevation,renderer.camera.distance,frame.x,frame.y,frame.scale].join('/');
    if(running||needsDraw||stamp!==lastViewStamp){
      if(mode==='physics'){renderer.draw(current());drawProbe();drawn=renderer.lastDrawResult.drawn;submissionMs=renderer.lastDrawResult.submissionMs;}else{const start=performance.now();researchDisplay.draw(scales,follow);drawn=true;submissionMs=performance.now()-start;}
      needsDraw=false;lastViewStamp=stamp;
    }
  }catch(exception){error=exception.message;playing=false;scalePlaying=false;$('study-fatal').hidden=false;$('study-fatal-message').textContent=error;}
  if(running&&now-lastUI>90){updateUI();lastUI=now;}requestAnimationFrame(animate);
  learning?.frame(now,{active:running,visible:document.visibilityState==='visible',focused:document.hasFocus(),drawn,submissionMs,steps});
}

$('room-physics').onclick=()=>setMode('physics');$('room-research').onclick=()=>setMode('research');
$('toggle-conditions').onclick=()=>{const open=document.body.classList.toggle('panel-open');$('toggle-conditions').setAttribute('aria-expanded',String(open));};
$('parameter-form').onsubmit=event=>{event.preventDefault();reset(proposedParameters());closeConditions();};
for(const key of parameterKeys)$(`study-${key}`).oninput=parameterLabels;
document.querySelectorAll('[data-gaussian]').forEach(button=>button.onclick=()=>{reset(GAUSSIAN_PRESETS[button.dataset.gaussian].parameters);closeConditions();});
$('study-play').onclick=()=>mode==='physics'?(playing?pause():resume()):(scalePlaying?pause():resume());
$('study-reset').onclick=()=>mode==='physics'?reset():resetScales();
$('study-history').oninput=event=>seek(Number(event.target.value));
$('study-probe').oninput=event=>{probe=Number(event.target.value);updateUI();};
$('probe-core').onclick=()=>{probe=Math.min(2.4,current().metrics.core);updateUI();};
document.querySelectorAll('[data-term]').forEach(button=>button.onclick=()=>{activeTerm=button.dataset.term;document.querySelectorAll('[data-term]').forEach(b=>b.classList.toggle('active',b===button));updateUI();});
$('capture-comparison').onclick=()=>{pause();const model=current();reference={parameters:{...model.parameters},tick:model.tick};toast('A 已冻结。改变一项条件，新的演变会自动停在同刻。');updateUI();};
$('clear-comparison').onclick=()=>{reference=null;comparisonTarget=null;updateUI();};
document.querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-answer]').forEach(b=>b.classList.toggle('selected',b===button));$('student-answer').textContent=button.dataset.answer==='peak'?'是的。ω₀ = Γ/(πa²)，环量保持时，较细的涡核对应更大的峰值涡量。':'再看 Γ 与 ω₀ 的区别：本实验 Γ 保持。变大的是峰值涡量，不是环量。';});
document.querySelectorAll('[data-energy]').forEach(button=>button.onclick=()=>{$('energy-answer').textContent=button.dataset.energy==='no'?'是的。核心体积约为 τ^(3/2−h)，乘上速度平方，核心能量约为 τ^(1/2−3h)，仍趋向零。':'还要乘上流动区域的体积。这里核心体积缩得足够快，核心能量下降；并非全域总能量趋向零。';});

function resetScales(){scales=researchScales(0);scalePlaying=false;updateUI();}
$('scale-slider').oninput=event=>{scalePlaying=false;scales=researchScales(Number(event.target.value));updateUI();};
$('scale-reset').onclick=resetScales;$('scale-fit').onclick=()=>{follow=!follow;updateUI();};
$('open-formulas').onclick=()=>{updateUI();$('formula-dialog').showModal();};
$('study-about').onclick=()=>$('about-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
canvas.onpointerdown=event=>{if(!ready)return;canvas.focus();canvas.setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY};};
canvas.onpointermove=event=>{if(!drag)return;renderer.camera.orbit(event.clientX-drag.x,event.clientY-drag.y);drag={x:event.clientX,y:event.clientY};};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};canvas.oncontextmenu=event=>event.preventDefault();
canvas.addEventListener('wheel',event=>{event.preventDefault();renderer?.camera.zoom(event.deltaY);},{passive:false});
canvas.onkeydown=event=>{if(learning?.active&&event.key===' '&&!learning.pending){event.preventDefault();return;}if(event.key===' '){event.preventDefault();mode==='physics'?(playing?pause():resume()):(scalePlaying?pause():resume());}else if(event.key.startsWith('Arrow')){event.preventDefault();renderer.camera.orbit(event.key==='ArrowLeft'?-15:event.key==='ArrowRight'?15:0,event.key==='ArrowUp'?-15:event.key==='ArrowDown'?15:0);}};

function view(){return {azimuth:renderer.camera.azimuth,elevation:renderer.camera.elevation,distance:renderer.camera.distance,skeleton:false};}
function researchPlan(){return encodeResearchPlan(scales.decades,follow,view());}
function loadPlan(text){
  try{
    if(typeof text!=='string'||text.length>1000000)throw new Error('方案不得超过 1 MB。');
    let raw;try{raw=JSON.parse(text);}catch{throw new Error('不是有效的 JSON。');}
    if(raw?.format==='shape-of-flow/research-scales-1'){
      const plan=readResearchPlan(raw);
      setMode('research');scales=researchScales(plan.decades);follow=plan.follow;Object.assign(renderer.camera,plan.view);scalePlaying=false;
    }else{
      const plan=readGaussianPlan(text);reference=plan.reference;reset(plan.parameters,{autoplay:false});
      Object.assign(renderer.camera,plan.view);probe=plan.probe;setMode('physics');
      if(plan.tick>0){viewIndex=null;replayTarget=plan.tick;comparisonTarget=null;playing=true;accumulator=0;}
    }
    $('study-load-dialog').close();updateUI();
  }catch(exception){$('study-import-error').textContent=exception.message;}
}
$('study-load').onclick=()=>{$('study-import-error').textContent='';$('study-load-dialog').showModal();};
$('study-import-button').onclick=()=>loadPlan($('study-import').value);
$('study-restore').onclick=()=>{try{const text=localStorage.getItem(storageKey);if(!text)throw new Error('本机还没有方程剧场或尺度学习卡。');loadPlan(text);}catch(exception){$('study-import-error').textContent=exception.message;}};

$('study-save').onclick=()=>{
  pause();if(mode==='physics')renderer.draw(current());else researchDisplay.draw(scales,follow);
  const model=current(),imageSource=mode==='physics'?canvas:$('scale-canvas');
  const id=`FLOW-${Date.now().toString(36).toUpperCase()}`;
  cardPlan={...(mode==='physics'?encodeGaussianPlan(model.parameters,model.tick,view(),probe,reference):researchPlan()),artworkId:id};
  const card=document.createElement('canvas');card.width=1500;card.height=1180;const ctx=card.getContext('2d');
  ctx.fillStyle='#040c13';ctx.fillRect(0,0,card.width,card.height);
  ctx.fillStyle='#e7dcc6';ctx.font='32px "SimSun",serif';ctx.fillText(`涡的形状 / ${mode==='physics'?'方程剧场':'反例核心的尺度释读'}`,60,66);
  // Preserve the camera aspect; do not crop a selected observation into a different one.
  const area={x:60,y:100,w:1380,h:720},fit=Math.min(area.w/imageSource.width,area.h/imageSource.height),w=imageSource.width*fit,h=imageSource.height*fit;
  ctx.drawImage(imageSource,area.x+(area.w-w)/2,area.y+(area.h-h)/2,w,h);
  ctx.strokeStyle='#506d6e';ctx.beginPath();ctx.moveTo(60,850);ctx.lineTo(1440,850);ctx.stroke();
  ctx.font='20px "Segoe UI","Microsoft YaHei",sans-serif';ctx.fillStyle='#b5c8bf';
  const lines=mode==='physics'?[
    `t ${model.time.toFixed(3)}  |  Γ ${model.parameters.gamma}  |  ν ${model.parameters.viscosity}  |  α ${model.parameters.strain}  |  a₀ ${model.parameters.initialCore.toFixed(4)}`,
    `a ${model.metrics.core.toFixed(6)}  |  ω₀ ${model.metrics.peak.toFixed(6)}  |  探针 r ${probe.toFixed(4)}`,
    '实际公式：ds/dt = 4ν − αs；ω = Γ/(πs) exp(−r²/s)，s = a²',
    '模型：无界高斯拉伸涡；径轴解析输运与角向 Simpson 积分。本实验不是 NS 反例。',
    '依据：Goudar & Elsinga, JFM 843 (2018), §2.1；方案含参数、时刻、视角和对照。',
  ]:[
    `τ ${scientific(scales.tau)}  |  h ${RESEARCH_H}  |  纤细度 ${scales.aspect.toFixed(6)}  |  镜头${follow?'跟随缩放':'固定'}`,
    `径向 ${scientific(scales.radial)}  |  轴向 ${scientific(scales.axial)}  |  速度 ${scientific(scales.speed)}  |  核心能量 ${scientific(scales.coreEnergy)}`,
    '代表幂律：ℓᵣ ≍ τ^(1/2)，ℓ𝓏 ≍ τ^(1/2−h)，U ≍ τ^(−1/2−h)，Ecore ≍ τ^(1/2−3h)',
    '几何包络与比例系数取 1 的尺度释读；不包含完整反例速度、振荡脉冲或误差修正。',
    '依据：OpenAI, Finite time blowup for Navier–Stokes (2026), §2.1、§3.1。',
  ];
  if(mode==='physics'&&reference){const a=gaussianState(reference.parameters,reference.tick*GAUSSIAN_MODEL.dt);lines.push(`对照 A：t ${a.time.toFixed(3)} · α ${a.strain} · ν ${a.viscosity} · Γ ${a.gamma} · a₀ ${a.initialCore.toFixed(3)} · a(t) ${Math.sqrt(a.core2).toFixed(6)}`);}
  if(mode==='research')lines.push(`示意相似窗口：X = ${RESEARCH_WINDOW.X}，|η| ≤ ${RESEARCH_WINDOW.etaMax}；不是论文完整速度剖面的边界。`);
  lines.forEach((line,i)=>ctx.fillText(line,60,895+i*42));
  ctx.font='14px monospace';ctx.fillStyle='#658f95';ctx.fillText(`${id} / 本图与 JSON 方案共用编号`,60,1150);
  const uri=card.toDataURL('image/png');$('card-preview').src=uri;$('card-image').href=uri;$('card-image').download=`${id}.png`;
  const json=JSON.stringify(cardPlan,null,2);$('card-json').value=json;$('card-plan').href=`data:application/json;charset=utf-8,${encodeURIComponent(json)}`;$('card-plan').download=`${id}.json`;
  $('card-title').textContent=`${id} · ${mode==='physics'?`t = ${model.time.toFixed(2)}`:`τ = ${scientific(scales.tau)}`}`;
  $('card-note').textContent=mode==='physics'?'卡片保留实际图像、参数、公式与来源。载入 JSON 从初态重放；跨设备不承诺逐像素一致。':'卡片保留代表幂律、来源与当前视图；这里展示的是核心尺度，不是完整反例的粒子动画。';
  $('card-dialog').showModal();
};
$('card-remember').onclick=()=>{try{localStorage.setItem(storageKey,JSON.stringify(cardPlan));toast('学习卡方案已在本机保存。');}catch{toast('本机保存不可用，请导出 JSON。');}};
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();playing=false;scalePlaying=false;error='图形上下文已丢失，请重新载入，再恢复此前保存的方案。';$('study-fatal').hidden=false;$('study-fatal-message').textContent=error;});

try{
  renderer=new VortexRenderer(canvas);Object.assign(renderer.camera,GAUSSIAN_VIEW);
  researchDisplay=new ResearchDisplay($('scale-canvas'),renderer.camera);reset();
  if(new URL(location.href).hash==='#research')setMode('research');
  learning=new LearningGuide({family:'field',snapshot:()=>mode==='physics'?{family:'gaussian',model:current(),probe,view:view()}:{family:'scales',scales,follow,view:view()},run:plan=>loadPlan(JSON.stringify(plan)),running:()=>mode==='physics'?playing:scalePlaying,pause,resume,probe:r=>{probe=r;updateUI();},scale:n=>{scalePlaying=false;scales=researchScales(n);updateUI();},follow:()=>{follow=!follow;updateUI();},formula:()=>$('open-formulas').click(),conditions:()=>$('toggle-conditions').click(),artwork:()=>$('study-save').click(),load:()=>$('study-load').click(),label:()=>mode==='physics'?`解析涡 / α ${world.parameters.strain} ν ${world.parameters.viscosity}`:'研究标度 / 几何包络',device:()=>({...renderer.deviceInfo(),renderPath:mode==='physics'?'WebGL2 解析涡示踪':'Canvas2D 文献几何'})});
  requestAnimationFrame(animate);
}catch(exception){$('study-fatal').hidden=false;$('study-fatal-message').textContent=exception.message;}
