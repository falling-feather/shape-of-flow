/** Explanations use the context recorded with that exact observation, including replay. */
export function explainEvolution(model,{maxCirculation=2.5,error=null,preset=model.preset}={}){
  const m=model.metrics,{inputStart=null,released=null,crossings=0}=model.context||{};
  if(error)return {index:'计算已停止',title:'保留最后一个有效时刻。',text:error,evidence:'请重置后继续；异常状态不作为演变结论。'};
  if(model.input){
    const lengthRatio=inputStart?m.length/inputStart.length:1,coreRatio=inputStart?m.core/inputStart.core:1;
    if(model.input.strain>.04)return {index:'02 / 拉伸',title:'一处拉长，整体回应。',text:coreRatio<.995?'涡丝变长时，模型按涡管体积近似收细涡核；旋转在更小的横截面中集中。':'拉伸与扩散同时发生。观察涡丝长度和核宽，而不只看亮度。',evidence:`长度 ${((lengthRatio-1)*100).toFixed(1)}% · 核宽 ${((coreRatio-1)*100).toFixed(1)}%（相对施力前）`};
    return {index:'01 / 输入旋转',title:'旋转正在进入流动。',text:Math.abs(model.rings[model.input.ring]?.gamma??0)>=maxCirculation-.001?'环量达到当前输入上限。你仍可拖动，改变拉伸方向。':'按住会改变所选涡环的环量。周围的示踪线随共同速度场卷绕。',evidence:`总环量 |Γ| ${m.circulation.toFixed(2)} · 影响涡环 ${model.input.ring===0?'A':'B'}`};
  }
  if(released&&model.time>=released.time){
    const ratio=m.core/released.core;
    const text=ratio>1.0005?'外部输入已停止，涡丝仍相互诱导。当前涡核比松手时更宽，旋转逐渐分散。':ratio<.9995?'外部输入已停止，自诱导拉伸仍在继续。当前涡核仍在收细，扩散的增宽作用尚未抵过拉伸。':'外部输入已停止，已有涡流继续运动。继续观察拉伸与扩散怎样改变涡核。';
    return {index:'03 / 余流',title:'手停下了，涡仍在演变。',text,evidence:`松手后 ${(model.time-released.time).toFixed(2)} t · 核宽 ${((ratio-1)*100).toFixed(1)}%`};
  }
  if(preset==='leapfrog'&&crossings>0)return {index:'相互诱导 / 已观察到',title:'它们交换了前后位置。',text:'前后涡环相互改变速度与半径，出现穿越式推进。镜头跟随整体涡心，便于观察相对运动。',evidence:`已记录 ${crossings} 次轴向次序变化 · 环量未因相遇改变`};
  return {index:'01 / 自诱导',title:preset==='ring'?'一个涡环，也能向前走。':'涡环在彼此推动。',text:'涡丝的每一段都会影响其余部分。即使没有手势输入，初始涡流也会沿自身速度场演变。',evidence:`涡丝长度 ${m.length.toFixed(2)} · 核宽 ${m.core.toFixed(3)} · 无量纲`};
}
