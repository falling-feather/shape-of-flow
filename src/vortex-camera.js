import { unit,VORTEX_VIEW } from './vortex-model.js';
import {VIEW_BOUNDS} from './view-state.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const framing=(width,height)=>height>width*1.4?{x:0,y:.3}:{x:.12,y:0};
export class VortexCamera {
  constructor(){Object.assign(this,VORTEX_VIEW);this.target=[0,0,0];this.fov=0.66;}
  orbit(dx,dy){this.azimuth-=dx*0.006;this.elevation=Math.max(-VIEW_BOUNDS.elevation,Math.min(VIEW_BOUNDS.elevation,this.elevation+dy*0.005));}
  zoom(delta){this.distance=Math.max(VIEW_BOUNDS.minDistance,Math.min(VIEW_BOUNDS.maxDistance,this.distance*Math.exp(delta*0.001)));}
  basis(){const z=[Math.sin(this.azimuth)*Math.cos(this.elevation),Math.sin(this.elevation),Math.cos(this.azimuth)*Math.cos(this.elevation)];const x=unit(cross([0,1,0],z));return {z,x,y:cross(z,x)};}
  matrix(width,height){
    const distance=this.distance*(this.fitScale||1)*(this.frame?.scale||1)*Math.max(1,height/width*1.1);
    const {x,y,z}=this.basis(),eye=this.target.map((v,i)=>v+distance*z[i]);
    const view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
    const offset=this.frame||framing(width,height),f=1/Math.tan(this.fov/2),near=0.05,far=150,proj=[f*height/width,0,0,0,0,f,0,0,-offset.x,-offset.y,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
    const out=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=proj[k*4+r]*view[c*4+k];
    return out;
  }
  planePoint(x,y,width,height){const {x:right,y:up}=this.basis(),offset=this.frame||framing(width,height),scale=this.distance*(this.fitScale||1)*(this.frame?.scale||1)*Math.max(1,height/width*1.1)*Math.tan(this.fov/2);return this.target.map((v,i)=>v+(2*x/width-1-offset.x)*scale*width/height*right[i]+(1-2*y/height-offset.y)*scale*up[i]);}
  project(point,width,height,m=this.matrix(width,height)){const p=[...point,1],q=[0,0,0,0];for(let r=0;r<4;r++)for(let k=0;k<4;k++)q[r]+=m[k*4+r]*p[k];return {x:(q[0]/q[3]+1)*width/2,y:(1-q[1]/q[3])*height/2,visible:q[3]>0};}
}
