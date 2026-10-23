/** Narration distinguishes exact equilibrium from an asymptotic approach. */
export function explainGaussian(model){
  const m=model.metrics,p=model.parameters,relative=Math.abs(m.coreRate)/Math.max(1e-12,4*p.viscosity+p.strain*m.core2);
  const evidence=`相对初态：核宽 ${((m.core/p.initialCore-1)*100).toFixed(1)}% · Γ 保持 ${p.gamma.toFixed(2)}`;
  if(p.strain===0)return {phase:'扩散 / 旋转逐渐舒展',heading:'旋转没有消失，它在摊开。',description:'此时没有径向速度，黏性仍可让涡量向外扩散。涡核增宽、峰值降低，环量保持。',evidence};
  if(relative<1e-12)return {phase:'平衡 / 两种作用相互抵消',heading:'形状稳定，流动仍在继续。',description:'拉伸使涡核收细，黏性使它扩散。两者达到平衡时，示踪线仍在旋转和轴向流动。',evidence};
  if(relative<.001)return {phase:'接近平衡 / 收细与扩散渐近抵消',heading:'变化慢下来，流动继续。',description:'涡核正接近 4ν/α 对应的平衡截面。变化率已经很小，仍不等于严格的零。',evidence};
  if(m.coreRate<0)return {phase:'集中 / 拉伸占上风',heading:'更细的核心，更集中的旋转。',description:'径向流入与轴向拉伸使涡核收细。相同环量集中在更小截面，峰值涡量随之增大。',evidence};
  return {phase:'舒展 / 扩散占上风',heading:'涡核正在舒展。',description:'当前扩散强于拉伸的收细作用，涡核变宽。并不是所有拉伸中的涡都会持续变细。',evidence};
}
