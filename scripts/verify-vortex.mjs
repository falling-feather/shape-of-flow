import {VortexWorld,VORTEX_MODEL,encodeVortexPlan,replayVortexPlan,ringCenter} from '../src/vortex-model.js';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const results=[];
for(const preset of ['ring','leapfrog','fold']){
  const world=new VortexWorld(preset),initial=world.metrics(),start=performance.now();let crossings=0,lastSign=1,maxLength=initial.length;
  for(let n=0;n<3600;n++){world.step();const m=world.metrics();maxLength=Math.max(maxLength,m.length);assert.ok(m.finite);
    if(preset==='leapfrog'){const delta=m.centers[1][2]-m.centers[0][2];if(Math.abs(delta)>.025){const sign=Math.sign(delta);if(sign!==lastSign)crossings++;lastSign=sign;}}}
  assert.ok(Math.abs(world.metrics().circulation-initial.circulation)<1e-12);
  if(preset==='ring')assert.ok(world.metrics().center[2]>initial.center[2]+.1);
  if(preset==='leapfrog')assert.ok(crossings>0);
  results.push({preset,elapsedMs:Math.round(performance.now()-start),initial,final:world.metrics(),crossings,maxLength});
}
const events=[{step:60,type:'input',ring:0,power:1,axis:[1,0,0],center:[0,0,.3],strain:.3},{step:300,type:'release'}];
const forced=encodeVortexPlan('leapfrog',events,600),a=replayVortexPlan(forced),b=replayVortexPlan(forced);
assert.deepEqual(a.rings[0].points,b.rings[0].points);
const g=a.rings[0].gamma;for(let n=0;n<120;n++)a.step();assert.equal(a.rings[0].gamma,g);
const coarse=replayVortexPlan(encodeVortexPlan('ring',[],240));
const finer=new VortexWorld('ring',{...VORTEX_MODEL,dt:VORTEX_MODEL.dt/2});for(let n=0;n<480;n++)finer.step();
const error=Math.hypot(...ringCenter(coarse.rings[0]).map((x,i)=>x-ringCenter(finer.rings[0])[i]));assert.ok(error<.01);
const evidence={model:VORTEX_MODEL,results,forced:{plan:forced,observedAtSavedTick:b.metrics(),afterRelease:a.metrics()},halfTimeStepCenterError:error};
await mkdir(new URL('../output/vortex-verification/',import.meta.url),{recursive:true});
await writeFile(new URL('../output/vortex-verification/model.json',import.meta.url),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({scenarios:results.map(r=>({preset:r.preset,crossings:r.crossings,finite:r.final.finite,maxLength:r.maxLength,elapsedMs:r.elapsedMs})),halfTimeStepCenterError:error,forcedCirculationAfterRelease:a.metrics().circulation}));
