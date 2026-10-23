/** Representative power laws, not the full counterexample velocity field.
 * OpenAI, Finite time blowup for Navier–Stokes, §2.1, pp. 3–4.
 * The paper gives asymptotic bounds (≍); we set proportionality factors to 1.
 */
import {normalizeView} from './view-state.js';
export const RESEARCH_H=.008;
export const RESEARCH_WINDOW=Object.freeze({X:.05,etaMax:.65});
export const RESEARCH_REVISION='similarity-window-1';
export const RESEARCH_SOURCE='https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf';
export function researchScales(decades){
  if(!Number.isFinite(decades)||decades<0||decades>6)throw new Error('标度窗口必须处于 0—6 个数量级内。');
  const tau=10**(-decades),h=RESEARCH_H;
  const radial=tau**.5,axial=tau**(.5-h),speed=tau**(-.5-h),volume=radial*radial*axial;
  return {decades,tau,h,radial,axial,speed,volume,aspect:axial/radial,coreEnergy:tau**(.5-3*h)};
}

/** A chosen similarity-coordinate window; not a solved E/U velocity profile. */
export function researchEnvelope(eta,angle,scales){
  const q=scales.tau/(1-eta*eta),radius=Math.sqrt(2*RESEARCH_WINDOW.X*q);
  return [radius*Math.cos(angle),q**(.5-scales.h)*eta,radius*Math.sin(angle)];
}

export function encodeResearchPlan(decades,follow,view){
  researchScales(decades);
  if(typeof follow!=='boolean')throw new Error('尺度镜头设置不合法。');
  return {format:'shape-of-flow/research-scales-1',solver:RESEARCH_REVISION,source:RESEARCH_SOURCE,h:RESEARCH_H,window:{...RESEARCH_WINDOW},decades,follow,view:normalizeView(view,{allowSkeleton:false})};
}

export function readResearchPlan(raw){
  if(raw?.format!=='shape-of-flow/research-scales-1'||raw.solver!==RESEARCH_REVISION||raw.source!==RESEARCH_SOURCE||raw.h!==RESEARCH_H||!raw.window||Object.entries(RESEARCH_WINDOW).some(([key,value])=>raw.window[key]!==value))throw new Error('研究来源、指数或几何窗口不兼容。');
  return encodeResearchPlan(raw.decades,raw.follow,raw.view);
}
