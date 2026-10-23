import {LearningJournal,LESSONS,makeLearningPlan,measureLearningObservation,readLearningResult,transferFinding} from './learning-core.js';
import {scientific} from './number-format.js';
import {sceneFrame} from './scene-framing.js';
import {PerformanceMeter} from './performance-meter.js';
import {VortexWorld} from './vortex-model.js';
import {vorticityBudget} from './gaussian-vortex.js';

const SESSION='shape-of-flow/learning-session';
const SAVED='shape-of-flow/learning-result';
const stages=['观察','预测','改条件','对照','解释'];
const $=id=>document.getElementById(id);
const setText=(node,text)=>{if(node.textContent===text)return false;node.textContent=text;return true;};
const button=(id,text,primary=false)=>`<button id="${id}"${primary?' class="primary"':''}>${text}</button>`;

export class LearningGuide {
  constructor(adapter){
    this.layoutDirty=true;this.stageRect=null;
    this.adapter=adapter;this.family=adapter.family;this.journal=new LearningJournal();this.active=false;this.screen='welcome';this.pending=null;this.variantViscosity=.032;this.meter=new PerformanceMeter();this.lastOverlay='';this.initialRing=adapter.family==='ring'?new VortexWorld('ring').rings[0].points:null;
    const host=document.createElement('div');host.id='learning-shell';
    host.innerHTML=`<header class="learning-header"><a class="learning-brand" href="/">涡的形状<small>观察流动，验证解释</small></a><nav aria-label="三个发现">${LESSONS.map(l=>`<button data-learning-chapter="${l.id}">${String(l.id).padStart(2,'0')} ${l.title}</button>`).join('')}</nav><div class="learning-header-tools"><button id="learning-mode">学习路径</button><button id="learning-model-button">模型关系</button><button id="learning-more-button">更多</button></div></header>
      <div id="learning-stage" aria-hidden="true"></div><canvas id="learning-overlay" aria-hidden="true"></canvas>
      <section id="learning-story"><p id="learning-nature"></p><h1 id="learning-question"></h1><p id="learning-cue"></p><p id="learning-live"></p></section>
      <section id="learning-panel" aria-label="学习任务"><ol id="learning-progress">${stages.map((s,i)=>`<li data-learning-step="${i}">${s}</li>`).join('')}</ol><div class="learning-panel-grid"><div><h2 id="learning-prompt"></h2><div id="learning-actions"></div><p id="learning-feedback" role="status"></p></div><div id="learning-measures"></div></div><footer><button id="learning-free">自由观赏</button><button id="learning-retry">重做本章</button><button id="learning-save">保存学习记录</button><button id="learning-restore">恢复记录</button><span id="learning-state-label"></span></footer></section>
      <dialog id="learning-model-dialog"><button data-learning-close="learning-model-dialog" class="learning-close" aria-label="关闭模型关系">关闭</button><h2>问题相连，模型各有范围</h2><table><thead><tr><th>观看对象</th><th>可以检验什么</th><th>范围</th></tr></thead><tbody><tr><td>离散涡环近似</td><td>输入结束后，已有涡流仍可自诱导演变</td><td>规则化涡丝与涡核扩散近似</td></tr><tr><td>高斯拉伸涡解析模型</td><td>只改黏性，比较同刻核宽、涡量与收支</td><td>无界理想场，具有解析速度</td></tr><tr><td>文献标度释读</td><td>比较核心范围、速度与核心能量的幂律</td><td>选定相似窗口，未复现完整反例速度或证明</td></tr></tbody></table><p>三章沿着问题深入，不是同一团流体的连续演化。Γ 表示围绕轴线的总体绕转效应，ω 描述局部旋转强度。前两章的青绿到铜橙表示涡量强弱，研究窗口的铜线表示几何包络。线宽、取样与光晕属于显示处理。</p><button id="learning-native-formula">查看本章实际公式与来源</button></dialog>
      <dialog id="learning-more-dialog"><button data-learning-close="learning-more-dialog" class="learning-close">关闭</button><h2>观赏与记录</h2><div class="learning-menu"><button id="learning-conditions">本章实验条件</button><button id="learning-formula">实际公式与依据</button><button id="learning-artwork">保存当前画面与条件</button><button id="learning-free-load">载入自由方案</button><button id="learning-performance">运行记录</button><a href="/lab-2d.html">二维绕流拓展实验</a></div><p>二维实验用于补充边界如何改道的观察，不进入这条三章学习主线。</p></dialog>
      <dialog id="learning-import-dialog"><button data-learning-close="learning-import-dialog" class="learning-close">关闭</button><h2>恢复一份发现记录</h2><label for="learning-import-text">粘贴学习记录 JSON</label><textarea id="learning-import-text" rows="7"></textarea><p id="learning-import-error" role="alert"></p><div class="learning-dialog-actions"><button id="learning-import-apply">读取并恢复</button><button id="learning-import-local">读取本机保存</button></div></dialog>
      <dialog id="learning-export-dialog"><button data-learning-close="learning-export-dialog" class="learning-close">关闭</button><h2>保留条件，也保留你的解释</h2><p id="learning-export-summary"></p><div class="learning-dialog-actions"><a id="learning-download" download>导出学习记录 JSON</a><button id="learning-remember">本机保存</button><button id="learning-export-artwork">生成当前画面卡</button></div><details><summary>查看记录数据</summary><textarea id="learning-export-json" rows="6" readonly aria-label="完整学习记录 JSON"></textarea></details><p>记录包含预测、实验条件、观测和解释。它是可复查的操作记录，不是学习效果认证或真人测试数据。</p></dialog>
      <dialog id="learning-perf-dialog"><button data-learning-close="learning-perf-dialog" class="learning-close">关闭</button><h2>当前设备运行记录</h2><p>采样持续 10 秒，只统计可见且正在演变的帧。CPU 提交时间不等于 GPU 耗时。</p><button id="learning-perf-start">开始活动采样 10 秒</button><p id="learning-perf-status" role="status">尚未采样</p><textarea id="learning-perf-json" rows="8" readonly aria-label="性能采样 JSON"></textarea></dialog>`;
    document.body.append(host);document.body.classList.add('enhanced');this.bind();
    const params=new URL(location.href).searchParams;
    const explicit=Number(params.get('lesson'));
    try{const text=sessionStorage.getItem(SESSION);if(text)this.journal=readLearningResult(text);}catch(error){this.storageError=error.message;}
    if(explicit>=1&&explicit<=3){if(explicit>1&&!Array.from({length:explicit-1},(_,i)=>this.journal.complete(i+1)).every(Boolean)){location.replace('/?lesson=1');return;}this.active=true;this.journal.activate(params.get('summary')==='1'&&[1,2,3].every(id=>this.journal.complete(id))?4:explicit);this.restoreCurrent();}
    else if(this.family==='ring'&&params.get('free')!=='1'){this.active=true;this.screen='welcome';if(!matchMedia('(prefers-reduced-motion: reduce)').matches)this.run('A',true);}
    this.render();
  }

  bind(){
    const invalidateLayout=()=>{this.layoutDirty=true;};
    window.addEventListener('resize',invalidateLayout);
    this.layoutObserver=new ResizeObserver(invalidateLayout);
    for(const node of document.querySelectorAll('#learning-panel,#learning-story,.bottom-panel,.study-footer,.equation-dock,.research-dock'))this.layoutObserver.observe(node);
    document.addEventListener('visibilitychange',()=>this.meter.visibility(performance.now(),document.visibilityState==='visible'));
    window.addEventListener('blur',()=>this.meter.focus(performance.now(),false));window.addEventListener('focus',()=>this.meter.focus(performance.now(),true));
    $('learning-mode').onclick=()=>this.active?this.exit():this.begin();$('learning-free').onclick=()=>this.exit();
    document.querySelectorAll('[data-learning-chapter]').forEach(b=>b.onclick=()=>this.navigate(Number(b.dataset.learningChapter)));
    $('learning-retry').onclick=()=>{const id=this.chapter();this.journal.retry(id);this.screen='observe';this.run('A');};
    $('learning-model-button').onclick=()=>$('learning-model-dialog').showModal();
    $('learning-native-formula').onclick=()=>{$('learning-model-dialog').close();this.adapter.formula();};
    $('learning-more-button').onclick=()=>$('learning-more-dialog').showModal();
    for(const [id,action] of [['learning-conditions','conditions'],['learning-formula','formula'],['learning-artwork','artwork'],['learning-free-load','load']])$(id).onclick=()=>{$('learning-more-dialog').close();this.adapter[action]();};
    $('learning-performance').onclick=()=>{$('learning-more-dialog').close();$('learning-perf-dialog').showModal();};
    $('learning-perf-start').onclick=()=>{this.meter.start(this.adapter.label(),this.adapter.device());$('learning-perf-status').textContent='正在采样，可关闭浮层继续观察';$('learning-perf-json').value='';this.adapter.resume();};
    document.querySelectorAll('[data-learning-close]').forEach(b=>b.onclick=()=>$(b.dataset.learningClose).close());
    $('learning-save').onclick=()=>this.export();$('learning-restore').onclick=()=>{$('learning-import-error').textContent='';$('learning-import-dialog').showModal();};
    $('learning-import-apply').onclick=()=>this.import($('learning-import-text').value);
    $('learning-import-local').onclick=()=>{try{const text=localStorage.getItem(SAVED);if(!text)throw new Error('本机还没有保存的学习记录。');this.import(text);}catch(error){$('learning-import-error').textContent=error.message;}};
    $('learning-remember').onclick=()=>{try{localStorage.setItem(SAVED,this.journal.serialize());$('learning-export-summary').textContent='学习记录已保存在当前浏览器来源下。';}catch(error){$('learning-export-summary').textContent=`本机保存失败：${error.message}`;}};
    $('learning-export-artwork').onclick=()=>{$('learning-export-dialog').close();this.adapter.artwork();};
  }
  chapter(){return Math.min(3,this.journal.state.active);}
  lesson(){return LESSONS[this.chapter()-1];}
  persist(){try{sessionStorage.setItem(SESSION,this.journal.serialize());}catch(error){this.storageError=`暂存失败，可用导出文件保留：${error.message}`;}}
  begin(){
    if(this.chapter()===1&&this.family!=='ring'){this.active=true;this.persist();location.assign('/?lesson=1');return;}
    if(this.journal.state.active>1||this.journal.lesson(1).trials.A){this.active=true;this.restoreCurrent();return;}
    this.active=true;if(this.previewReady){this.journal.record(1,'A',this.previewReady);this.screen='predict';this.persist();this.render();}
    else{this.screen='observe';if(this.pending)this.pending.preview=false;else this.run('A');this.render();}
  }
  exit(){this.previewReady=null;this.pending=null;this.adapter.pause();this.active=false;history.replaceState(null,'',`${this.family==='ring'?'/':'/equations.html'}?free=1${this.adapter.snapshot().family==='scales'?'#research':''}`);this.render();}
  navigate(chapter){
    if(this.active){try{this.journal.activate(chapter);}catch(error){this.feedback(error.message);return;}this.persist();}
    const page=chapter===1?'/':'/equations.html';
    if(this.active&&((chapter===1&&this.family==='ring')||(chapter>1&&this.family==='field'))){this.restoreCurrent();return;}
    if(this.active)location.assign(`${page}?lesson=${chapter}`);
    else location.assign(chapter===1?'/?free=1':`/equations.html?free=1${chapter===3?'#research':''}`);
  }
  restoreCurrent(){
    const chapter=this.chapter();
    if((chapter===1)!==(this.family==='ring')){this.persist();location.assign(chapter===1?'/?lesson=1':`/equations.html?lesson=${chapter}`);return;}
    this.active=true;const lesson=this.journal.lesson(chapter),trial=lesson.trials.B||lesson.trials.A;
    this.screen=this.journal.state.active===4?'summary':this.journal.complete(chapter)?'complete':lesson.trials.B&&this.journal.goal(chapter)?'compare':lesson.prediction?'change':lesson.trials.A?'predict':'observe';
    if(trial){this.pending={variant:lesson.trials.B?'B':'A',review:true,plan:trial.plan,returnScreen:this.screen};this.screen='running';this.adapter.run(trial.plan);queueMicrotask(()=>this.observe());}
    else this.run('A');this.render();
  }
  run(variant,preview=false,review=false){
    const chapter=this.chapter(),setting=chapter===2?this.variantViscosity:chapter===3?6:undefined;
    const plan=review?this.journal.lesson(chapter).trials[variant]?.plan:makeLearningPlan(chapter,variant,setting);
    if(!plan)return;this.pending={variant,preview,review,setting,plan,returnScreen:review?'compare':null};if(!preview)this.screen='running';
    this.adapter.run(plan);this.render();queueMicrotask(()=>this.observe());
  }
  observe(){
    if(!this.active)return;
    const observation=this.adapter.snapshot();this.lastObservation=observation;
    if(this.pending&&!this.adapter.running()){
      const chapter=this.chapter(),p=this.pending,atTarget=observation.family===this.lesson().family&&(chapter===3?observation.scales.decades===p.plan?.decades:observation.model.metrics.tick===p.plan?.tick);
      if(atTarget){
        this.pending=null;
        try{
          if(p.review){this.screen=p.returnScreen||'compare';this.render();}
          else{
            const measured=measureLearningObservation(chapter,p.variant,observation);
            if(p.preview&&this.screen==='welcome'){this.previewReady=measured;this.render();}
            else{this.journal.record(chapter,p.variant,measured,p.setting);this.journal.setView(chapter,p.variant,observation.view,observation.follow);this.persist();this.screen=p.variant==='A'?'predict':this.journal.goal(chapter)?'compare':'change';this.render();if(p.variant==='B'&&!this.journal.goal(chapter))this.feedback(chapter===2?'这次黏性还未让涡核增宽。调高 ν 后再检验。':'先把 τ 缩小到三个数量级以上。');}
          }
        }catch(error){this.screen='observe';this.render();this.feedback(`记录未通过核对：${error.message}`);}
      }else{this.pausedHint=true;this.feedback('实验已暂停。继续后仍按原条件运行。');}
    }
    if(this.pending&&this.adapter.running()&&this.pausedHint){this.pausedHint=false;this.feedback('');}
    this.live(observation);
  }

  render(){
    this.layoutDirty=true;
    document.body.classList.toggle('learning-active',this.active);$('learning-panel').hidden=!this.active;$('learning-story').hidden=!this.active;$('learning-overlay').hidden=!this.active||this.family!=='ring';
    $('learning-mode').textContent=this.active?'自由观赏':'学习路径';
    $('learning-conditions').disabled=this.active;$('learning-perf-start').disabled=this.active;
    const chapter=this.chapter(),lesson=this.lesson();
    document.querySelectorAll('[data-learning-chapter]').forEach(b=>{const id=Number(b.dataset.learningChapter);b.classList.toggle('active',this.active?id===chapter:this.family==='ring'?id===1:id===(this.adapter.snapshot().family==='scales'?3:2));b.disabled=this.active&&id>1&&!Array.from({length:id-1},(_,i)=>this.journal.complete(i+1)).every(Boolean);});
    if(!this.active)return;
    if(this.screen!=='welcome'){const a=this.journal.state.active;history.replaceState(null,'',a===1?'/?lesson=1':`/equations.html?lesson=${Math.min(3,a)}${a===4?'&summary=1':''}`);}
    $('learning-nature').textContent=`发现 ${chapter}/3　${lesson.nature}`;$('learning-question').textContent=lesson.question;$('learning-cue').textContent=lesson.observe;$('learning-feedback').textContent=this.storageError||'';
    if(['change','compare','explain'].includes(this.screen)||(this.screen==='running'&&this.pending?.variant==='B'))$('learning-cue').textContent=lesson.change;
    const progress=this.screen==='running'&&this.pending?.variant==='A'?0:{welcome:0,observe:0,running:2,predict:1,change:2,compare:3,explain:4,complete:4,summary:4}[this.screen];
    document.querySelectorAll('[data-learning-step]').forEach(e=>e.classList.toggle('active',Number(e.dataset.learningStep)===progress));
    $('learning-measures').innerHTML='<div class="learning-current-numbers" id="learning-current-numbers"></div><div id="learning-comparison-numbers"></div>';
    const actions=$('learning-actions');
    if(this.screen==='welcome'){
      $('learning-nature').textContent='可操作的流体学习体验';$('learning-question').textContent='让观看，成为一次发现。';$('learning-cue').textContent='先观察，再留下预测。用同一时刻的实验数据核对自己的解释。';
      $('learning-prompt').textContent='三个小实验，连接动作、计算和研究尺度。';actions.innerHTML=button('learning-begin','开始三个发现',true)+button('learning-welcome-free','先自由观赏');$('learning-begin').onclick=()=>this.begin();$('learning-welcome-free').onclick=()=>this.exit();
    }else if(this.screen==='observe'||this.screen==='running'){
      $('learning-prompt').textContent=this.pending?.review?'正在恢复到原来的观察时刻。':this.pending?.variant==='B'?'正在运行你改变条件后的 B。':'先看 A，记录一个共同观察时刻。';
      actions.innerHTML=button('learning-pause','暂停 / 继续')+button('learning-restart-trial','重跑这次实验');$('learning-pause').onclick=()=>this.adapter.running()?this.adapter.pause():this.adapter.resume();$('learning-restart-trial').onclick=()=>this.run(this.pending?.variant||'A');
    }else if(this.screen==='predict'){
      $('learning-prompt').textContent=lesson.predict;actions.innerHTML=lesson.predictions.map(([id,text])=>`<button data-learning-prediction="${id}">${text}</button>`).join('');
      actions.querySelectorAll('[data-learning-prediction]').forEach(b=>b.onclick=()=>{this.journal.predict(chapter,b.dataset.learningPrediction);this.persist();this.screen='change';this.render();});
    }else if(this.screen==='change'){
      $('learning-prompt').textContent=lesson.change;
      if(chapter===1){actions.innerHTML=button('learning-run-b','改为提前松手，运行 B',true);$('learning-run-b').onclick=()=>this.run('B');}
      if(chapter===2){actions.innerHTML=`<label class="learning-condition" for="learning-viscosity">运动黏性 ν <output id="learning-viscosity-value">${this.variantViscosity.toFixed(3)}</output><input id="learning-viscosity" type="range" min="0.004" max="0.04" step="0.002" value="${this.variantViscosity}"></label>${button('learning-run-b','用当前 ν 运行 B',true)}`;$('learning-viscosity').oninput=e=>{this.variantViscosity=Number(e.target.value);$('learning-viscosity-value').textContent=this.variantViscosity.toFixed(3);};$('learning-run-b').onclick=()=>this.run('B');}
      if(chapter===3){actions.innerHTML=`<label class="learning-condition" for="learning-decades">缩小的数量级 <output id="learning-decades-value">0.00</output><input id="learning-decades" type="range" min="0" max="6" step=".01" value="0"></label>${button('learning-scale-follow','跟随尺度观察')}${button('learning-check-scale','记录当前标度作 B',true)}`;$('learning-decades').oninput=e=>{const n=Number(e.target.value);$('learning-decades-value').textContent=n.toFixed(2);this.adapter.scale(n);};$('learning-scale-follow').onclick=()=>this.adapter.follow();$('learning-check-scale').onclick=()=>{const obs=this.adapter.snapshot(),n=obs.scales.decades;try{this.journal.record(3,'B',measureLearningObservation(3,'B',obs),n);this.journal.setView(3,'B',obs.view,obs.follow);this.persist();if(this.journal.goal(3)){this.screen='compare';this.render();}else this.feedback('先缩小至少三个数量级，再记录。');}catch(error){this.feedback(error.message);}};}
    }else if(this.screen==='compare'){
      $('learning-prompt').textContent=chapter===1?'相同时刻，B 的输入已停。再看松手后的位移与环量。':chapter===2?'把探针放在轴心，比较拉伸与扩散的真实数值。':'固定与跟随镜头看到同一 τ。速度增长，还要乘上缩小的核心体积。';
      actions.innerHTML=button('learning-review-a','回看 A')+button('learning-review-b','回看 B')+(chapter===2?`<label class="learning-probe" for="learning-probe">探针 r <input id="learning-probe" type="range" min="0" max="1.2" step=".01" value="0"></label>${button('learning-probe-axis','回到轴心')}`:chapter===3?button('learning-follow-compare','固定 / 跟随镜头'):'')+button('learning-explain','我来解释',true);
      $('learning-review-a').onclick=()=>this.run('A',false,true);$('learning-review-b').onclick=()=>this.run('B',false,true);$('learning-explain').onclick=()=>{if(chapter===2){this.adapter.probe(0);this.journal.setProbe(0);this.persist();}this.screen='explain';this.render();};
      if(chapter===2){$('learning-probe').oninput=e=>{const r=Number(e.target.value);this.adapter.probe(r);this.journal.setProbe(r);this.persist();};$('learning-probe-axis').onclick=()=>{this.adapter.probe(0);$('learning-probe').value=0;this.journal.setProbe(0);this.persist();};}if(chapter===3)$('learning-follow-compare').onclick=()=>this.adapter.follow();
    }else if(this.screen==='explain'){
      $('learning-prompt').textContent='哪一种解释与本次数据一致？';actions.innerHTML=lesson.explanations.map(([id,text])=>`<button data-learning-explanation="${id}">${text}</button>`).join('');
      actions.querySelectorAll('[data-learning-explanation]').forEach(b=>b.onclick=()=>{this.journal.explain(chapter,b.dataset.learningExplanation);this.persist();if(this.journal.complete(chapter)){this.screen='complete';this.render();}else this.feedback('把解释再和条件、探针或尺度范围核对一次。');});
    }else if(this.screen==='complete'){
      $('learning-prompt').textContent='这次解释已与观测对应。';$('learning-cue').textContent=lesson.transition;actions.innerHTML=button('learning-next',chapter===3?'保存三个发现，做一道迁移核对':'进入下一种模型',true)+button('learning-review-result','再看本章数据');$('learning-next').onclick=()=>{this.journal.activate(chapter+1);this.persist();if(chapter===3){this.screen='summary';this.render();}else this.navigate(chapter+1);};$('learning-review-result').onclick=()=>{this.screen='compare';this.render();};
    }else if(this.screen==='summary'){
      $('learning-nature').textContent='三个发现的记录';$('learning-question').textContent='把关系用到新情境。';$('learning-cue').textContent='回到第二章的初态关系。保持 Γ 不变，把核宽 a 增至两倍，预测峰值涡量。';$('learning-prompt').textContent='ω₀ 会变成原来的多少？';actions.innerHTML=['quarter','half','same'].map((id,i)=>`<button data-transfer="${id}">${['四分之一','二分之一','不变'][i]}</button>`).join('')+button('learning-final-export','保存完整发现记录',true);
      actions.querySelectorAll('[data-transfer]').forEach(b=>b.onclick=()=>{this.journal.transfer(b.dataset.transfer);this.persist();const f=transferFinding();this.feedback(b.dataset.transfer==='quarter'?`初态解析值：${f.originalPeak.toFixed(3)} 变为 ${f.doubledCorePeak.toFixed(3)}，比值 ${f.ratio}。这是一项迁移核对，不是学习效果评分。`:'再看 ω₀ = Γ/(πa²)：变化的是核宽的平方。');});$('learning-final-export').onclick=()=>this.export();
    }
    $('learning-state-label').textContent=`已核对 ${[1,2,3].filter(id=>this.journal.complete(id)).length}/3 项发现`;
    this.live(this.adapter.snapshot());
  }

  feedback(text){if(setText($('learning-feedback'),text))this.layoutDirty=true;}
  live(obs){
    if(!this.active)return;
    let html='';
    if(obs.family==='ring'){const m=obs.model.metrics;html=`<span>模型时间<strong>${m.time.toFixed(2)}</strong></span><span>环量 Γ<strong>${m.circulation.toFixed(3)}</strong></span><span>涡心位置 z<strong>${m.center[2].toFixed(3)}</strong></span>`;setText($('learning-live'),obs.model.input?'外部输入进行中':'外部输入已停止，观察运动是否继续。');}
    if(obs.family==='gaussian'){const m=obs.model.metrics,b=vorticityBudget(obs.probe||0,obs.model.state);html=`<span>模型时间<strong>${m.time.toFixed(2)}</strong></span><span>核宽 a<strong>${m.core.toFixed(3)}</strong></span><span>峰值 ω₀<strong>${m.peak.toFixed(2)}</strong></span><span>环量 Γ<strong>${m.circulation.toFixed(2)}</strong></span>`;setText($('learning-live'),`探针 r ${(obs.probe||0).toFixed(2)}：拉伸 ${scientific(b.stretch)}，扩散 ${scientific(b.diffusion)}，净变化 ${scientific(b.net)}。`);}
    if(obs.family==='scales'){const s=obs.scales;html=`<span>τ<strong>${scientific(s.tau)}</strong></span><span>速度标度<strong>${scientific(s.speed)}</strong></span><span>核心能量<strong>${scientific(s.coreEnergy)}</strong></span>`;setText($('learning-live'),`${obs.follow?'跟随放大':'固定镜头'}；这里只展示文献核心尺度，非完整反例速度场。`);}
    const target=$('learning-current-numbers');if(target&&target.innerHTML!==html)target.innerHTML=html;
    const {A:a,B:b}=this.journal.lesson(this.chapter()).trials,comparison=$('learning-comparison-numbers');
    if(comparison&&a&&b&&['compare','explain','complete','summary'].includes(this.screen)){const chapter=this.chapter();setText(comparison,chapter===1?`同刻：A Γ=${a.measurement.gamma.toFixed(3)}，B Γ=${b.measurement.gamma.toFixed(3)}。B 松手后继续前进 ${b.measurement.afterReleaseDistance.toFixed(3)}，环量保持 ${b.measurement.releaseGamma.toFixed(3)}。`:chapter===2?`同刻 t=${b.measurement.time.toFixed(2)}：A a=${a.measurement.core.toFixed(3)}，B a=${b.measurement.core.toFixed(3)}；初态 a₀=${b.measurement.initialCore.toFixed(3)}，只改变 ν。`:`τ 从 1 到 ${scientific(b.measurement.tau)}：速度增大、核心体积和核心能量减小。全域总能量不在这个读数中。`);}else if(comparison)setText(comparison,'');
  }

  frame(now,stats){
    const report=this.meter.frame(now,stats);if(report){$('learning-perf-json').value=JSON.stringify(report,null,2);$('learning-perf-status').textContent=report.meanFps===null?'活动帧不足，本次不生成帧率结论。':`可见活动 ${report.activeMs.toFixed(0)} ms，均值 ${report.meanFps.toFixed(1)} FPS，p95 ${report.p95FrameMs.toFixed(1)} ms；隐藏 ${report.hiddenDurationMs.toFixed(0)} ms、失焦 ${report.unfocusedDurationMs.toFixed(0)} ms。`;}
  }
  compose(camera,observation){
    const size=`${innerWidth}/${innerHeight}`;
    if(this.layoutDirty||!this.stageRect||this.stageSize!==size){
      const stage=$('learning-stage');
      const floor=this.active?$('learning-panel').getBoundingClientRect().top:Math.min(innerHeight-30,...['.bottom-panel','.equation-dock','.research-dock','.study-footer'].map(selector=>document.querySelector(selector)).filter(Boolean).map(node=>node.getBoundingClientRect()).filter(rect=>rect.height>0).map(rect=>rect.top));
      const bottom=`${Math.max(20,innerHeight-floor+16)}px`,top=innerWidth<=700?`${this.active?$('learning-story').getBoundingClientRect().bottom+12:190}px`:'';
      if(stage.style.bottom!==bottom)stage.style.bottom=bottom;if(stage.style.top!==top)stage.style.top=top;
      this.stageRect=stage.getBoundingClientRect();this.stageSize=size;this.layoutDirty=false;
    }
    return sceneFrame(camera,observation,this.stageRect,innerWidth,innerHeight);
  }
  drawOverlay(camera,observation){
    const c=$('learning-overlay');if(!this.active||observation.family!=='ring')return;
    const ratio=Math.min(devicePixelRatio||1,1.5),w=Math.round(innerWidth*ratio),h=Math.round(innerHeight*ratio),stamp=[w,h,...camera.matrix(w,h)].join('/');if(stamp===this.lastOverlay)return;this.lastOverlay=stamp;
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}const ctx=c.getContext('2d');ctx.clearRect(0,0,w,h);ctx.strokeStyle='#73beb764';ctx.lineWidth=ratio;ctx.setLineDash([4*ratio,7*ratio]);const points=this.initialRing,matrix=camera.matrix(w,h);ctx.beginPath();
    for(let i=0;i<=points.length/3;i++){const k=(i%(points.length/3))*3,p=camera.project(Array.from(points.slice(k,k+3)),w,h,matrix);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.stroke();ctx.setLineDash([]);const p=camera.project([0,-1.05,0],w,h,matrix),stage=this.stageRect,x=(stage.left+12)*ratio,y=(stage.bottom-18)*ratio;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(x+80*ratio,y-13*ratio);ctx.stroke();ctx.fillStyle='#a4c8c1';ctx.font=`${12*ratio}px "Microsoft YaHei",sans-serif`;ctx.fillText('初态位置（参照）',x,y);
  }
  export(){
    this.adapter.pause();const text=this.journal.serialize();$('learning-export-json').value=text;$('learning-download').href=`data:application/json;charset=utf-8,${encodeURIComponent(text)}`;$('learning-download').download='涡的形状-学习记录.json';$('learning-export-summary').textContent=`记录 ${[1,2,3].filter(id=>this.journal.complete(id)).length} 个已核对发现，保留模型、条件、预测与解释。`;$('learning-export-dialog').showModal();
  }
  import(text){try{this.journal=readLearningResult(text);this.pending=null;this.persist();$('learning-import-dialog').close();this.restoreCurrent();}catch(error){$('learning-import-error').textContent=error.message;}}
}
