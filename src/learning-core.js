import {encodeVortexPlan,readVortexPlan,replayVortexPlan} from './vortex-model.js';
import {GAUSSIAN_MODEL,GAUSSIAN_VIEW,encodeGaussianPlan,readGaussianPlan,gaussianState,vorticityBudget} from './gaussian-vortex.js';
import {encodeResearchPlan,readResearchPlan,researchScales} from './research-scales.js';
import {normalizeView} from './view-state.js';

export const LEARNING_FORMAT='shape-of-flow/learning-1';
export const LEARNING_TICK=300;
export const RELEASE_TICK=150;
export const LEARNING_FIELD=Object.freeze({gamma:3.2,viscosity:.004,strain:.7,initialCore:.3});
export const LESSONS=Object.freeze([
  {id:1,title:'松手以后',question:'手停了，涡会停吗？',nature:'离散涡环近似',family:'ring',
    observe:'先看持续输入的 A。光轨由涡环自己的速度场推动。',
    predict:'若提前松手，接下来的涡环会怎样？',
    predictions:[['stops','马上停止运动'],['continues','停止输入，仍会运动']],
    change:'把持续输入改为提前松手，保持初态与观察时刻相同。',
    explanations:[['self-induced','已有涡流继续自诱导运动'],['extra-force','松手后系统又补了一把力']],correct:'self-induced',
    transition:'刚才用近似涡环看见了自诱导。接下来换用有解析解的拉伸涡，把变化拆成可核对的公式。'},
  {id:2,title:'谁决定强弱',question:'有拉伸，涡就一定变细吗？',nature:'高斯拉伸涡解析模型',family:'gaussian',
    observe:'A 保持较低黏性。观察它怎样收细，环量 Γ 始终保持 3.2。',
    predict:'在同样拉伸下提高黏性，涡核可能怎样变化？',
    predictions:[['only-narrow','只要有拉伸，就只会收细'],['can-widen','扩散也可能让涡核增宽']],
    change:'只改运动黏性 ν。让新的 B 跑到 A 的同一时刻，寻找增宽条件。',
    explanations:[['diffusion','轴心处扩散减弱旋转的作用更强'],['strain-only','存在拉伸就说明峰值一定增强']],correct:'diffusion',
    transition:'解析模型帮助我们检验拉伸与扩散。下一章换成论文的局部尺度释读，用它讨论核心范围和能量，不延续刚才那团流体。'},
  {id:3,title:'更快与更小',question:'局部更快，能量一定更大吗？',nature:'文献标度释读',family:'scales',
    observe:'先以 τ=1 看一个相似坐标窗口。铜线是核心包络，不是粒子轨迹。',
    predict:'靠近奇异时刻，速度标度增长。核心能量还取决于什么？',
    predictions:[['speed-implies-energy','速度增长，核心能量就必然增长'],['volume-matters','还要考虑核心体积的缩小']],
    change:'把剩余时间 τ 缩小至少三个数量级。先固定镜头看收缩，再打开跟随观察。',
    explanations:[['core-scaling','这是核心尺度推论，完整速度场另有构造'],['whole-energy-zero','这说明全域总能量归零'],['full-proof','这段动画已经验证了完整证明']],correct:'core-scaling',
    transition:'三个发现已经有了各自的条件与证据。最后把核宽关系用到一个新情境。'},
]);

const blankLesson=()=>({prediction:null,explanation:null,trials:{A:null,B:null}});
const close=(a,b)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(b));
function sameNumbers(actual,expected){
  if(typeof expected==='number')return Number.isFinite(actual)&&close(actual,expected);
  if(expected===null||typeof expected!=='object')return actual===expected;
  return actual&&Object.entries(expected).every(([key,value])=>sameNumbers(actual[key],value));
}
function measuredFields(actual,shape){
  if(shape===null||typeof shape!=='object')return actual;
  return Object.fromEntries(Object.entries(shape).map(([key,value])=>[key,measuredFields(actual[key],value)]));
}

function fieldSetting(setting){return typeof setting==='number'?{viscosity:setting,probe:0}:{viscosity:setting?.viscosity??.032,probe:setting?.probe??0};}
export function makeLearningPlan(chapter,variant,setting){
  if(![1,2,3].includes(chapter)||!['A','B'].includes(variant))throw new Error('未知的学习实验。');
  if(chapter===1){
    const events=[{step:60,type:'input',ring:0,power:1,axis:[1,0,0],center:[0,0,0],strain:0}];
    if(variant==='B')events.push({step:RELEASE_TICK,type:'release'});
    return encodeVortexPlan('ring',events,LEARNING_TICK);
  }
  if(chapter===2){
    const selected=fieldSetting(setting),parameters={...LEARNING_FIELD,viscosity:variant==='A'?LEARNING_FIELD.viscosity:selected.viscosity};
    return encodeGaussianPlan(parameters,LEARNING_TICK,GAUSSIAN_VIEW,variant==='A'?0:selected.probe,variant==='B'?{parameters:{...LEARNING_FIELD},tick:LEARNING_TICK}:null);
  }
  return encodeResearchPlan(variant==='A'?0:setting??6,false,GAUSSIAN_VIEW);
}

function ringMeasurement(world,variant){
  const m=world.metrics(),release=variant==='B'?replayVortexPlan({...makeLearningPlan(1,'B'),tick:RELEASE_TICK}).metrics():null;
  return {time:m.time,gamma:m.circulation,position:m.center[2],releaseGamma:release?.circulation??null,afterReleaseDistance:release?m.center[2]-release.center[2]:null};
}
function fieldMeasurement(parameters,tick,probe){
  const state=gaussianState(parameters,tick*GAUSSIAN_MODEL.dt);
  return {time:state.time,gamma:state.gamma,alpha:state.strain,viscosity:state.viscosity,initialCore:state.initialCore,core:Math.sqrt(state.core2),peak:state.gamma/(Math.PI*state.core2),probe,budget:vorticityBudget(probe,state)};
}
export function expectedObservation(chapter,variant,setting){
  const plan=makeLearningPlan(chapter,variant,setting);
  if(chapter===1)return ringMeasurement(replayVortexPlan(plan),variant);
  if(chapter===2)return fieldMeasurement(plan.parameters,plan.tick,plan.probe);
  const s=researchScales(plan.decades);return {decades:s.decades,tau:s.tau,radial:s.radial,axial:s.axial,speed:s.speed,volume:s.volume,coreEnergy:s.coreEnergy,aspect:s.aspect};
}

/** Reads the model actually displayed by an adapter, before journal validation. */
export function measureLearningObservation(chapter,variant,observation){
  const lesson=LESSONS[chapter-1];if(observation.family!==lesson.family)throw new Error('当前场景与学习实验不匹配。');
  if(chapter===3){const s=observation.scales;return {decades:s.decades,tau:s.tau,radial:s.radial,axial:s.axial,speed:s.speed,volume:s.volume,coreEnergy:s.coreEnergy,aspect:s.aspect};}
  const model=observation.model,m=model.metrics;
  if(m.tick!==LEARNING_TICK)throw new Error('实验尚未到达共同观察时刻。');
  if(chapter===2){const p=model.parameters,probe=observation.probe??0;return {time:m.time,gamma:m.circulation,alpha:p.strain,viscosity:p.viscosity,initialCore:p.initialCore,core:m.core,peak:m.peak,probe,budget:vorticityBudget(probe,model.state)};}
  const release=model.context?.released;
  if(variant==='B'&&!release)throw new Error('尚未记录松手时刻。');
  return {time:m.time,gamma:m.circulation,position:m.center[2],releaseGamma:release?.circulation??null,afterReleaseDistance:release?m.center[2]-release.center[2]:null};
}

function normalizeTrialPlan(chapter,variant,raw){
  const plan=chapter===1?readVortexPlan(JSON.stringify(raw)):chapter===2?readGaussianPlan(JSON.stringify(raw)):readResearchPlan(raw);
  const setting=chapter===2?{viscosity:plan.parameters.viscosity,probe:plan.probe}:chapter===3?plan.decades:undefined;
  const expected=makeLearningPlan(chapter,variant,setting),physical={...plan,view:expected.view};
  if(chapter===3)physical.follow=false;
  if(JSON.stringify(physical)!==JSON.stringify(expected))throw new Error('学习实验的固定条件发生了变化。');
  return {plan,setting};
}

export class LearningJournal {
  constructor(){this.state={format:LEARNING_FORMAT,active:1,lessons:Array.from({length:3},blankLesson),transfer:null};}
  lesson(chapter){if(!LESSONS[chapter-1])throw new Error('未知章节。');return this.state.lessons[chapter-1];}
  predict(chapter,choice){
    const lesson=this.lesson(chapter);if(!lesson.trials.A)throw new Error('请先观察 A，再记录预测。');
    if(lesson.trials.B)throw new Error('预测已在实验前记录；重做本章可重新预测。');
    if(!LESSONS[chapter-1].predictions.some(([id])=>id===choice))throw new Error('预测选项不合法。');
    lesson.prediction=choice;
  }
  record(chapter,variant,measurement,setting){
    const lesson=this.lesson(chapter);
    if(variant==='B'&&(!lesson.trials.A||!lesson.prediction))throw new Error('请先观察并预测。');
    const expected=expectedObservation(chapter,variant,setting);
    if(!sameNumbers(measurement,expected))throw new Error('观测值与本次实验条件不一致。');
    lesson.trials[variant]={plan:makeLearningPlan(chapter,variant,setting),measurement:measuredFields(measurement,expected)};
    lesson.explanation=null;
  }
  setView(chapter,variant,view,follow){
    const trial=this.lesson(chapter).trials[variant];if(!trial)return;
    trial.plan.view=normalizeView(view,{allowSkeleton:false});if(chapter===3)trial.plan.follow=Boolean(follow);
  }
  setProbe(radius){
    const lesson=this.lesson(2),trial=lesson.trials.B;if(!trial)return;
    const view=trial.plan.view;
    const setting={viscosity:trial.plan.parameters.viscosity,probe:radius};
    trial.plan=makeLearningPlan(2,'B',setting);trial.plan.view=view;trial.measurement=expectedObservation(2,'B',setting);
  }
  goal(chapter){
    const {A:a,B:b}=this.lesson(chapter).trials;if(!a||!b)return false;
    if(chapter===1)return b.measurement.afterReleaseDistance>.02&&close(b.measurement.gamma,b.measurement.releaseGamma);
    if(chapter===2)return a.measurement.core<a.measurement.initialCore&&b.measurement.core>b.measurement.initialCore;
    return b.measurement.decades>=3&&b.measurement.speed>1&&b.measurement.coreEnergy<1;
  }
  explain(chapter,choice){
    const lesson=this.lesson(chapter);if(!lesson.trials.B)throw new Error('请先运行对照实验。');
    if(!LESSONS[chapter-1].explanations.some(([id])=>id===choice))throw new Error('解释选项不合法。');
    lesson.explanation=choice;
  }
  complete(chapter){return this.goal(chapter)&&this.lesson(chapter).explanation===LESSONS[chapter-1].correct;}
  activate(chapter){
    if(!Number.isInteger(chapter)||chapter<1||chapter>4)throw new Error('章节不合法。');
    if(chapter>1&&!Array.from({length:chapter-1},(_,i)=>this.complete(i+1)).every(Boolean))throw new Error('先完成前面的发现。');
    this.state.active=chapter;
  }
  retry(chapter){this.state.lessons[chapter-1]=blankLesson();this.state.active=chapter;this.state.transfer=null;}
  transfer(choice){if(![1,2,3].every(id=>this.complete(id)))throw new Error('先完成三个发现。');if(!['quarter','half','same'].includes(choice))throw new Error('迁移选项不合法。');this.state.transfer=choice;}
  serialize(){return JSON.stringify(this.state,null,2);}
}

export function readLearningResult(text){
  if(typeof text!=='string'||text.length>100000)throw new Error('学习记录不得超过 100 KB。');
  let raw;try{raw=JSON.parse(text);}catch{throw new Error('不是有效的学习记录 JSON。');}
  if(raw?.format!==LEARNING_FORMAT||!Array.isArray(raw.lessons)||raw.lessons.length!==3)throw new Error('学习记录格式不兼容。');
  const journal=new LearningJournal();
  raw.lessons.forEach((lesson,index)=>{
    const chapter=index+1;
    for(const variant of ['A','B']){
      const trial=lesson?.trials?.[variant];
      if(variant==='B'&&lesson.prediction)journal.predict(chapter,lesson.prediction);
      if(!trial)continue;
      const {plan,setting}=normalizeTrialPlan(chapter,variant,trial.plan);
      journal.record(chapter,variant,trial.measurement,setting);journal.setView(chapter,variant,plan.view,plan.follow);
    }
    if(lesson.explanation)journal.explain(chapter,lesson.explanation);
  });
  journal.activate(raw.active??1);if(raw.transfer)journal.transfer(raw.transfer);
  return journal;
}

export function transferFinding(){
  const original=gaussianState({...LEARNING_FIELD,initialCore:.3},0),changed=gaussianState({...LEARNING_FIELD,initialCore:.6},0);
  const originalPeak=original.gamma/(Math.PI*original.core2),doubledCorePeak=changed.gamma/(Math.PI*changed.core2);
  return {time:0,originalCore:.3,doubledCore:.6,gamma:original.gamma,originalPeak,doubledCorePeak,ratio:doubledCorePeak/originalPeak};
}
