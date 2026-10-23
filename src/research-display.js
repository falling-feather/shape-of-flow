import {researchEnvelope,RESEARCH_WINDOW} from './research-scales.js';

/** Geometry from similarity coordinates. Deliberately no tracer advection here. */
export class ResearchDisplay {
  constructor(canvas,camera){this.canvas=canvas;this.context=canvas.getContext('2d');this.camera=camera;}
  draw(scales,follow){
    const canvas=this.canvas,ctx=this.context,rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);
    const width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.clearRect(0,0,width,height);
    this.camera.target=[0,0,0];this.camera.fitScale=(follow?scales.axial:1)*1.4;
    const matrix=this.camera.matrix(width,height);
    const project=(eta,angle)=>this.camera.project(researchEnvelope(eta,angle,scales).map(x=>x*2.6),width,height,matrix);
    const path=points=>{ctx.beginPath();points.forEach((point,i)=>i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.stroke();};
    // Wires describe an envelope; color is a geometric display choice, not vorticity.
    ctx.lineWidth=.7*ratio;ctx.strokeStyle='#65b4bd42';ctx.shadowBlur=0;
    const limit=RESEARCH_WINDOW.etaMax;
    for(let k=0;k<32;k++){const angle=k/32*Math.PI*2;path(Array.from({length:41},(_,j)=>project(-limit+j/40*2*limit,angle)));}
    ctx.strokeStyle='#e9b97d82';ctx.shadowColor='#d9a76a';ctx.shadowBlur=7*ratio;
    for(let j=0;j<31;j++){const eta=-limit+j/30*2*limit;path(Array.from({length:97},(_,k)=>project(eta,k/96*Math.PI*2)));}
    ctx.shadowBlur=0;
    const center=this.camera.project([0,0,0],width,height,matrix);
    ctx.strokeStyle='#95d0cd55';ctx.lineWidth=.7*ratio;ctx.beginPath();ctx.moveTo(center.x-7*ratio,center.y);ctx.lineTo(center.x+7*ratio,center.y);ctx.moveTo(center.x,center.y-7*ratio);ctx.lineTo(center.x,center.y+7*ratio);ctx.stroke();
    const reference=project(0,0),axis=this.camera.project([0,0,0],width,height,matrix);
    ctx.font=`${9*ratio}px "Segoe UI","Microsoft YaHei",sans-serif`;ctx.fillStyle='#98b7b6';
    const rulerY=height-300*ratio,rulerWidth=100*ratio;
    const left=this.camera.planePoint(center.x-rulerWidth/2,rulerY,width,height),right=this.camera.planePoint(center.x+rulerWidth/2,rulerY,width,height);
    const rulerLength=Math.hypot(...left.map((x,i)=>x-right[i]))/2.6;
    ctx.strokeStyle='#b7c6b080';ctx.beginPath();ctx.moveTo(center.x-rulerWidth/2,rulerY);ctx.lineTo(center.x+rulerWidth/2,rulerY);ctx.moveTo(center.x-rulerWidth/2,rulerY-3*ratio);ctx.lineTo(center.x-rulerWidth/2,rulerY+3*ratio);ctx.moveTo(center.x+rulerWidth/2,rulerY-3*ratio);ctx.lineTo(center.x+rulerWidth/2,rulerY+3*ratio);ctx.stroke();
    const label=rulerLength<.001?rulerLength.toExponential(2):rulerLength.toPrecision(3);
    ctx.fillText(`${label}  原坐标单位`,center.x-rulerWidth/2,rulerY-10*ratio);
    const physicalRadius=researchEnvelope(0,0,scales)[0],pixelRadius=Math.hypot(reference.x-axis.x,reference.y-axis.y);
    return {physicalRadius,pixelRadius,rulerLength,follow};
  }
}
