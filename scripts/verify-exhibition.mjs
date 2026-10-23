import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {gaussianState,gaussianVelocity,pressureGradient,vorticityBudget,advanceGaussianTracer} from '../src/gaussian-vortex.js';
import {researchScales} from '../src/research-scales.js';

let maxMomentumResidual=0,maxDivergence=0,maxBudgetResidual=0,maxCirculationError=0,cases=0;
const e=1e-4;
for(const gamma of [1,3.2,5])for(const viscosity of [.004,.012,.04])for(const strain of [0,.7,1.2])for(const initialCore of [.18,.55,.85])for(const time of [0,.8,6,20]){
  const parameters={gamma,viscosity,strain,initialCore},state=gaussianState(parameters,time);
  for(const point of [[0,.2,0],[.05,-.3,.04],[.25,.1,-.2],[.9,.3,.7]]){
    const u=gaussianVelocity(point,state),plus=gaussianVelocity(point,gaussianState(parameters,time+e)),minus=gaussianVelocity(point,gaussianState(parameters,time-e));
    const timeDerivative=plus.map((x,i)=>(x-minus[i])/(2*e)),convection=[0,0,0],laplacian=[0,0,0];let divergence=0;
    for(let axis=0;axis<3;axis++){
      const p=[...point],m=[...point];p[axis]+=e;m[axis]-=e;const v=gaussianVelocity(p,state),w=gaussianVelocity(m,state);
      divergence+=(v[axis]-w[axis])/(2*e);
      for(let k=0;k<3;k++){convection[k]+=u[axis]*(v[k]-w[k])/(2*e);laplacian[k]+=(v[k]-2*u[k]+w[k])/(e*e);}
    }
    const pressure=pressureGradient(point,state);
    maxMomentumResidual=Math.max(maxMomentumResidual,...timeDerivative.map((x,i)=>Math.abs(x+convection[i]+pressure[i]-viscosity*laplacian[i])));
    maxDivergence=Math.max(maxDivergence,Math.abs(divergence));cases++;
  }
  for(const radius of [0,.1,.6]){
    const omega=s=>s.gamma/(Math.PI*s.core2)*Math.exp(-radius*radius/s.core2);
    const derivative=(omega(gaussianState(parameters,time+e))-omega(gaussianState(parameters,time-e)))/(2*e);
    maxBudgetResidual=Math.max(maxBudgetResidual,Math.abs(vorticityBudget(radius,state).net-derivative));
  }
  const n=320,limit=8*Math.sqrt(state.core2),dr=limit/n;
  const integrand=r=>2*Math.PI*r*state.gamma/(Math.PI*state.core2)*Math.exp(-r*r/state.core2);
  let sum=integrand(0)+integrand(limit);for(let i=1;i<n;i++)sum+=(i%2?4:2)*integrand(i*dr);
  maxCirculationError=Math.max(maxCirculationError,Math.abs(sum*dr/3-gamma));
}
assert.ok(maxMomentumResidual<.001);assert.ok(maxDivergence<.0001);assert.ok(maxBudgetResidual<.0001);assert.ok(maxCirculationError<.00001);
const parameters={gamma:5,viscosity:.004,strain:1.2,initialCore:.18},initial=[.05,.001,.03];
function trajectory(dt){let point=[...initial];const n=Math.round(1/dt);for(let k=0;k<n;k++)point=advanceGaussianTracer(point,gaussianState(parameters,5+k*dt),gaussianState(parameters,5+(k+1)*dt),dt);return point;}
const coarse=trajectory(1/120),fine=trajectory(1/1200),traceDifference=Math.hypot(...coarse.map((x,i)=>x-fine[i]));
assert.ok(traceDifference<1e-6);
const reference={cases,maxMomentumResidual,maxDivergence,maxBudgetResidual,maxCirculationError,traceDifference,traceRadialError:Math.abs(Math.hypot(coarse[0],coarse[2])-Math.hypot(initial[0],initial[2])*Math.exp(-parameters.strain/2)),finiteDifferenceStep:e,scales:[0,2,4,6].map(researchScales)};
await mkdir(new URL('../output/exhibition-verification/',import.meta.url),{recursive:true});
await writeFile(new URL('../output/exhibition-verification/mathematics.json',import.meta.url),JSON.stringify(reference,null,2));
console.log(JSON.stringify({cases,maxMomentumResidual,maxDivergence,maxBudgetResidual,maxCirculationError,traceDifference}));
