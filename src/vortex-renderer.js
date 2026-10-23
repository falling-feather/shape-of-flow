import { VortexCamera } from './vortex-camera.js';
import { VORTEX_MODEL,VORTEX_VIEW,packSegments,velocityAt,strainVelocity } from './vortex-model.js';
import {advanceGaussianTracer} from './gaussian-vortex.js';
import {OBSERVATION_INTERVAL} from './observation-history.js';
export const TRACERS = Object.freeze({ side:64, history:96, interval:2, lifetime:4.5, maxSegments:2*VORTEX_MODEL.points });
const VERT=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const FIELD=`
uniform sampler2D oldP,oldD,newP,newD;
uniform int segmentCount;
uniform int fieldKind;
uniform vec3 analyticBefore,analyticAfter;
uniform vec3 strainAxis,strainCenter;
uniform float strainRate;
float gaussianRotation(float r2,vec3 state){float q=r2/state.y;float ratio=q<.05?1.-q*(.5-q*(.166666667-q*(.041666667-q*(.008333333-q*.001388889)))):(1.-exp(-q))/q;return state.x/(6.28318530718*state.y)*ratio;}
vec3 strain(vec3 p){vec3 r=p-strainCenter;return strainRate*(1.5*strainAxis*dot(strainAxis,r)-.5*r);}
vec4 field(vec3 point,bool newer){vec3 v=vec3(0),omega=vec3(0);
 if(fieldKind==1){vec3 state=newer?analyticAfter:analyticBefore;float r2=dot(point.xz,point.xz),q=r2/state.y;
 float rotation=gaussianRotation(r2,state);
 return vec4(-.5*state.z*point.x+rotation*point.z,state.z*point.y,-.5*state.z*point.z-rotation*point.x,abs(state.x)/(3.14159265359*state.y)*exp(-q));}
 for(int i=0;i<${TRACERS.maxSegments};i++){if(i>=segmentCount)break;
 vec4 a=newer?texelFetch(newP,ivec2(i,0),0):texelFetch(oldP,ivec2(i,0),0);
 vec4 b=newer?texelFetch(newD,ivec2(i,0),0):texelFetch(oldD,ivec2(i,0),0);
 vec3 r=point-a.xyz;float r2=dot(r,r)+a.w;float f=b.w*.07957747154594767/(r2*sqrt(r2));
 v+=cross(b.xyz,r)*f;omega+=b.xyz*(3.*a.w*f/r2);}
 return vec4(v+strain(point),length(omega));}
uint hash(uint x){x^=x>>16;x*=uint(0x7feb352d);x^=x>>15;x*=uint(0x846ca68b);return x^(x>>16);}
float random(uint x){return float(hash(x)&uint(0xffffff))/16777216.;}
vec3 seedPoint(uint id){
 if(fieldKind==1){float angle=random(id+uint(119))*6.2831853,a=sqrt(analyticAfter.y),radius=a*(.2+(min(3.2,3.2/a)-.2)*random(id+uint(811)));
 float height=(random(id+uint(921))<.5?-1.:1.)*(.035+random(id+uint(922))*.45);return vec3(radius*cos(angle),height,radius*sin(angle));}
 int n=int(random(id+uint(739))*float(segmentCount));vec4 p=texelFetch(newP,ivec2(n,0),0),d=texelFetch(newD,ivec2(n,0),0);
 vec3 tangent=normalize(d.xyz),ref=abs(tangent.y)<.9?vec3(0,1,0):vec3(1,0,0);
 vec3 a=normalize(cross(ref,tangent)),b=cross(tangent,a);float angle=random(id+uint(119))*6.2831853;
 float radius=sqrt(p.w)*(.45+pow(random(id+uint(811)),1.7)*4.0);
 return p.xyz+radius*(a*cos(angle)+b*sin(angle))+d.xyz*(random(id+uint(211))-.5);}
`;
const ADVECT=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
${FIELD}
uniform sampler2D previous;uniform float dt,time;uniform bool initialize;
out vec4 position;
void main(){ivec2 at=ivec2(gl_FragCoord.xy);uint id=uint(at.y*64+at.x)+uint(49231);vec4 p=texelFetch(previous,at,0);
 float generation=floor((time+dt)/4.5+random(id+uint(5101)));
 bool outside=fieldKind==1&&(abs(p.y)>2.6||length(p.xz)>3.5);
 if(outside)generation=max(generation,floor(p.w*.5)+1.);
 if(initialize||outside||generation>floor(p.w*.5)){p.xyz=seedPoint(id+(fieldKind==1?uint(generation)*uint(431):uint(0)));}
 else if(fieldKind==1){float decay=exp(-analyticAfter.z*dt*.5),r2=dot(p.xz,p.xz);vec3 middle=analyticAfter;middle.y=(analyticBefore.y*decay+analyticAfter.y)/(1.+decay);
 float angle=dt/6.*(gaussianRotation(r2,analyticBefore)+4.*gaussianRotation(r2*decay,middle)+gaussianRotation(r2*decay*decay,analyticAfter));vec2 rotation=normalize(vec2(cos(angle),sin(angle)));float c=rotation.x,s=rotation.y;p.xyz=vec3((p.x*c+p.z*s)*decay,p.y/(decay*decay),(p.z*c-p.x*s)*decay);}
 else {vec4 a=field(p.xyz,false),b=field(p.xyz+dt*a.xyz,true);p.xyz+=dt*.5*(a.xyz+b.xyz);}
 if(!initialize&&fieldKind==1)generation=max(generation,floor(p.w*.5));
 float color=clamp(log(1.+field(p.xyz,true).w)/log(41.),0.,.985);
 position=vec4(p.xyz,generation*2.+color);}`;
const TRACE_VERT=`#version 300 es
precision highp float;precision highp int;precision highp sampler2DArray;
uniform sampler2DArray history;uniform mat4 matrix;uniform vec2 viewport;
uniform int head,available,layerCount;uniform float lineWidth;uniform bool analyticDisplay;
out float side,alpha,colorValue;
ivec2 particle(){return ivec2(gl_InstanceID%64,gl_InstanceID/64);}
void main(){int s=gl_VertexID/6,k=gl_VertexID%6;bool endpoint=(k==2||k==3||k==5);float signSide=(k==0||k==2||k==3)?-1.:1.;
 int l0=(head-s+layerCount*2)%layerCount,l1=(head-s-1+layerCount*2)%layerCount;
 vec4 a=texelFetch(history,ivec3(particle(),l0),0),b=texelFetch(history,ivec3(particle(),l1),0);
 vec4 p=matrix*vec4(a.xyz,1),q=matrix*vec4(b.xyz,1);vec2 direction=(q.xy/q.w-p.xy/p.w)*viewport;
 float len=length(direction);vec2 normal=len>.001?vec2(-direction.y,direction.x)/len:vec2(0);
 gl_Position=endpoint?q:p;gl_Position.xy+=normal*signSide*lineWidth/viewport*gl_Position.w;
 side=signSide;float age=float(s)/max(1.,float(available-1));
 bool valid=s<available-1&&floor(a.w*.5)==floor(b.w*.5)&&len>.01&&len<viewport.x*.5&&p.w>.1&&q.w>.1;
 float windowFade=analyticDisplay?(1.-smoothstep(1.4,2.6,max(abs(a.y),abs(b.y))))*.85:1.;
 alpha=valid?pow(1.-age,1.45)*.32*windowFade:0.;colorValue=endpoint?mod(b.w,2.):mod(a.w,2.);
}`;
const TRACE_FRAG=`#version 300 es
precision highp float;in float side,alpha,colorValue;out vec4 pixel;
void main(){vec3 c=mix(vec3(.025,.48,.63),vec3(1.8,.61,.17),smoothstep(.18,.80,colorValue));float edge=pow(max(0.,1.-abs(side)),.55);pixel=vec4(c,alpha*edge*(.07+.93*colorValue*colorValue));}`;
const POINT_VERT=`#version 300 es
precision highp float;uniform sampler2D positions;uniform mat4 matrix;uniform float pixelRatio;uniform bool analyticDisplay;
out float colorValue,windowFade;
void main(){vec4 p=texelFetch(positions,ivec2(gl_VertexID%64,gl_VertexID/64),0);gl_Position=matrix*vec4(p.xyz,1);colorValue=mod(p.w,2.);windowFade=analyticDisplay?(1.-smoothstep(1.4,2.6,abs(p.y)))*.85:1.;gl_PointSize=clamp((1.5+colorValue*1.4)*pixelRatio,1.,5.);}`;
const POINT_FRAG=`#version 300 es
precision highp float;in float colorValue,windowFade;out vec4 pixel;
void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;vec3 c=mix(vec3(.025,.48,.63),vec3(1.7,.70,.23),smoothstep(.18,.80,colorValue));pixel=vec4(c,pow(1.-r,2.)*.55*(.1+.9*colorValue*colorValue)*windowFade);}`;
const CORE_VERT=`#version 300 es
precision highp float;in vec4 vertex;uniform mat4 matrix;out float heat;
void main(){gl_Position=matrix*vec4(vertex.xyz,1);heat=vertex.w;}`;
const CORE_FRAG=`#version 300 es
precision highp float;in float heat;out vec4 pixel;
void main(){pixel=vec4(mix(vec3(.09,.65,.73),vec3(1.5,.82,.39),heat),.14);}`;
const BLUR=`#version 300 es
precision highp float;in vec2 uv;uniform sampler2D source;uniform vec2 direction;uniform bool threshold;out vec4 pixel;
void main(){vec3 c=texture(source,uv).rgb*.227027;c+=(texture(source,uv+direction*1.384615).rgb+texture(source,uv-direction*1.384615).rgb)*.316216;c+=(texture(source,uv+direction*3.230769).rgb+texture(source,uv-direction*3.230769).rgb)*.070270;pixel=vec4(threshold?max(c-.18,0.):c,1);}`;
const COMPOSITE=`#version 300 es
precision highp float;in vec2 uv;uniform sampler2D scene,bloom;out vec4 pixel;
void main(){vec2 p=(uv-.5)*vec2(1.2,1.);float vignette=clamp(1.-length(p)*.8,0.,1.);
 vec3 background=mix(vec3(.002,.005,.009),vec3(.006,.019,.027),vignette);
 vec3 c=texture(scene,uv).rgb+texture(bloom,uv).rgb*.55;
 c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);pixel=vec4(pow(max(c,0.),vec3(.4545))+background,1);}`;

export class VortexRenderer {
  constructor(canvas){
    this.stateRevision=0;this.lastImageStamp=null;this.lastDrawResult={drawn:false,submissionMs:0};
    this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    if(!this.gl)throw new Error('这个画场需要 WebGL2；可先进入二维实验。');
    const gl=this.gl;if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('设备不支持浮点流场缓冲，请使用支持 WebGL2 的浏览器。');
    gl.getExtension('EXT_float_blend');this.linear=Boolean(gl.getExtension('OES_texture_float_linear'));
    this.camera=new VortexCamera();this.programs={advect:this.program(VERT,ADVECT),trace:this.program(TRACE_VERT,TRACE_FRAG),point:this.program(POINT_VERT,POINT_FRAG),core:this.program(CORE_VERT,CORE_FRAG),blur:this.program(VERT,BLUR),composite:this.program(VERT,COMPOSITE)};
    this.emptyVAO=gl.createVertexArray();gl.bindVertexArray(this.emptyVAO);
    this.segmentTextures=Array.from({length:4},()=>this.texture(TRACERS.maxSegments,1,gl.RGBA32F));
    this.segmentData=new Float32Array(TRACERS.maxSegments*4);
    this.particleTextures=[this.texture(64,64,gl.RGBA32F),this.texture(64,64,gl.RGBA32F)];this.read=0;
    this.computeFBO=gl.createFramebuffer();
    this.historyTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.historyTexture);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA32F,64,64,TRACERS.history);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    this.head=0;this.available=0;this.skeleton=VORTEX_VIEW.skeleton;this.coreBuffer=gl.createBuffer();this.coreVAO=gl.createVertexArray();
    gl.bindVertexArray(this.coreVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.coreBuffer);const location=gl.getAttribLocation(this.programs.core,'vertex');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,4,gl.FLOAT,false,16,0);gl.bindVertexArray(this.emptyVAO);
    this.lastDrawMs=0;this.resize();
  }
  program(vertex,fragment){const gl=this.gl,shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
  texture(w,h,format,linear=false){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texStorage2D(gl.TEXTURE_2D,1,format,w,h);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
  target(w,h){const gl=this.gl,texture=this.texture(w,h,gl.RGBA16F,this.linear),fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('画场颜色缓冲不可用。');return {texture,fbo,w,h};}
  resize(){const gl=this.gl,r=this.canvas.getBoundingClientRect();this.ratio=Math.min(devicePixelRatio||1,1.5);const scale=Math.min(1,1600/(r.width*this.ratio));const w=Math.max(2,Math.round(r.width*this.ratio*scale)),h=Math.max(2,Math.round(r.height*this.ratio*scale));if(w===this.canvas.width&&h===this.canvas.height&&this.scene)return;
    this.canvas.width=w;this.canvas.height=h;for(const target of [this.scene,this.blurA,this.blurB])if(target){gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.fbo);}this.scene=this.target(w,h);this.blurA=this.target(Math.ceil(w/2),Math.ceil(h/2));this.blurB=this.target(Math.ceil(w/2),Math.ceil(h/2));gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
  use(name){const gl=this.gl,p=this.programs[name];gl.useProgram(p);gl.bindVertexArray(this.emptyVAO);return p;}
  sampler(p,name,texture,unit,target){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(target||gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(p,name),unit);}
  uploadSegment(texture,data){const gl=this.gl;this.segmentData.fill(0);this.segmentData.set(data);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,TRACERS.maxSegments,1,gl.RGBA,gl.FLOAT,this.segmentData);}
  fieldUniforms(p,before,after,input){const gl=this.gl;[before.positions,before.vectors,after.positions,after.vectors].forEach((data,i)=>this.uploadSegment(this.segmentTextures[i],data));['oldP','oldD','newP','newD'].forEach((name,i)=>this.sampler(p,name,this.segmentTextures[i],i));gl.uniform1i(gl.getUniformLocation(p,'segmentCount'),after.count);gl.uniform1i(gl.getUniformLocation(p,'fieldKind'),after.kind==='gaussian'?1:0);gl.uniform3fv(gl.getUniformLocation(p,'analyticBefore'),before.analytic||[0,1,0]);gl.uniform3fv(gl.getUniformLocation(p,'analyticAfter'),after.analytic||[0,1,0]);gl.uniform3fv(gl.getUniformLocation(p,'strainAxis'),input?.axis||[0,0,1]);gl.uniform3fv(gl.getUniformLocation(p,'strainCenter'),input?.center||[0,0,0]);gl.uniform1f(gl.getUniformLocation(p,'strainRate'),input?.strain||0);}
  integrate(before,after,time,input,initialize=false,dt=VORTEX_MODEL.dt){const gl=this.gl,p=this.use('advect');gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,this.computeFBO);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.particleTextures[1-this.read],0);gl.viewport(0,0,64,64);this.fieldUniforms(p,before,after,input);this.sampler(p,'previous',this.particleTextures[this.read],4);gl.uniform1f(gl.getUniformLocation(p,'dt'),initialize?0:dt);gl.uniform1f(gl.getUniformLocation(p,'time'),time);gl.uniform1i(gl.getUniformLocation(p,'initialize'),initialize?1:0);gl.drawArrays(gl.TRIANGLES,0,3);this.read=1-this.read;this.stateRevision++;}
  copyHistory(){const gl=this.gl;this.head=(this.head+1)%TRACERS.history;gl.bindFramebuffer(gl.FRAMEBUFFER,this.computeFBO);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.particleTextures[this.read],0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.historyTexture);gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,this.head,0,0,64,64);this.available=Math.min(TRACERS.history,this.available+1);}
  initialize(world){const field=world.field();this.integrate(field,field,0,null,true);this.head=-1;this.available=0;this.copyHistory();this.lastModel=world.snapshot();}
  step(world,fields){this.integrate(fields.before,fields.after,world.time-world.config.dt,world.input,false,world.config.dt);if(world.tick%TRACERS.interval===0)this.copyHistory();this.lastModel=world.snapshot();}
  readParticles(){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.computeFBO);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.particleTextures[this.read],0);const data=new Float32Array(64*64*4);gl.readPixels(0,0,64,64,gl.RGBA,gl.FLOAT,data);return data;}
  loadFrame(frame,previousFrames){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.particleTextures[this.read]);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,64,64,gl.RGBA,gl.FLOAT,frame.particles);const frames=previousFrames.slice(-Math.ceil(TRACERS.history*TRACERS.interval/OBSERVATION_INTERVAL));this.available=frames.length;this.head=frames.length-1;gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.historyTexture);frames.forEach((f,i)=>gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,64,64,1,gl.RGBA,gl.FLOAT,f.particles));this.lastModel=frame.model;this.stateRevision++;}
  verifyFirstStep(world){return this.verifyTransport(world,1);}
  verifyTransport(world,steps){
    const before=this.readParticles(),points=Array.from({length:12},(_,i)=>Array.from(before.slice(i*4,i*4+3)));
    const state=field=>({gamma:field.analytic[0],core2:field.analytic[1],strain:field.analytic[2]}),dt=world.config.dt;
    for(let n=0;n<steps;n++){
      const fields=world.step();this.step(world,fields);
      for(let i=0;i<points.length;i++){
        const p=points[i];
        if(fields.after.kind==='gaussian')points[i]=advanceGaussianTracer(p,state(fields.before),state(fields.after),dt);
        else{const a=velocityAt(p,fields.before),s=strainVelocity(p,world.input),predict=p.map((x,k)=>x+dt*(a[k]+s[k])),b=velocityAt(predict,fields.after),s2=strainVelocity(predict,world.input);points[i]=p.map((x,k)=>x+dt*.5*(a[k]+s[k]+b[k]+s2[k]));}
      }
    }
    const after=this.readParticles();let maximum=0,radialMaximum=0,axialMaximum=0,checked=0;
    for(let i=0;i<points.length;i++){const j=i*4;if(Math.floor(before[j+3]/2)!==Math.floor(after[j+3]/2))continue;maximum=Math.max(maximum,...points[i].map((x,k)=>Math.abs(x-after[j+k])));radialMaximum=Math.max(radialMaximum,Math.abs(Math.hypot(points[i][0],points[i][2])-Math.hypot(after[j],after[j+2])));axialMaximum=Math.max(axialMaximum,Math.abs(points[i][1]-after[j+1]));checked++;}
    if(checked===0||maximum>.002)throw new Error('示踪输运自检未通过，画场已停止。');
    return {maximum,radialMaximum,axialMaximum,checked,steps};
  }
  deviceInfo(){const gl=this.gl,extension=gl.getExtension('WEBGL_debug_renderer_info');return {webglVersion:gl.getParameter(gl.VERSION),renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),hardwareConcurrency:navigator.hardwareConcurrency??null,deviceMemoryGB:navigator.deviceMemory??null,viewport:[innerWidth,innerHeight],canvas:[this.canvas.width,this.canvas.height],devicePixelRatio:devicePixelRatio||1,documentFocused:document.hasFocus(),visibility:document.visibilityState};}
  draw(model=this.lastModel){if(!model)return;const started=performance.now(),gl=this.gl;this.resize();this.camera.target=[...model.metrics.center];this.camera.fitScale=Math.max(1,model.metrics.span/3.2);const {width:w,height:h}=this.canvas,matrix=this.camera.matrix(w,h);const stamp=[this.stateRevision,w,h,this.ratio,this.skeleton,model.kind,...matrix].join("/");if(stamp===this.lastImageStamp){this.lastDrawResult={drawn:false,submissionMs:0};return;}this.lastImageStamp=stamp;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.scene.fbo);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    const analytic=model.kind==='gaussian',displayCount=analytic?1536:64*64;
    let p=this.use('trace');this.sampler(p,'history',this.historyTexture,0,gl.TEXTURE_2D_ARRAY);gl.uniformMatrix4fv(gl.getUniformLocation(p,'matrix'),false,matrix);gl.uniform2f(gl.getUniformLocation(p,'viewport'),w,h);gl.uniform1i(gl.getUniformLocation(p,'head'),this.head);gl.uniform1i(gl.getUniformLocation(p,'available'),this.available);gl.uniform1i(gl.getUniformLocation(p,'layerCount'),TRACERS.history);gl.uniform1i(gl.getUniformLocation(p,'analyticDisplay'),analytic?1:0);gl.uniform1f(gl.getUniformLocation(p,'lineWidth'),(analytic?1.1:1.35)*this.ratio);if(this.available>1)gl.drawArraysInstanced(gl.TRIANGLES,0,(this.available-1)*6,displayCount);
    p=this.use('point');this.sampler(p,'positions',this.particleTextures[this.read],0);gl.uniformMatrix4fv(gl.getUniformLocation(p,'matrix'),false,matrix);gl.uniform1f(gl.getUniformLocation(p,'pixelRatio'),this.ratio);gl.uniform1i(gl.getUniformLocation(p,'analyticDisplay'),analytic?1:0);gl.drawArrays(gl.POINTS,0,displayCount);
    if(this.skeleton){const segments=packSegments(model.rings),lines=new Float32Array(segments.count*8);for(let i=0;i<segments.count;i++){const k=i*4;for(let endpoint=0;endpoint<2;endpoint++){const at=i*8+endpoint*4;for(let axis=0;axis<3;axis++)lines[at+axis]=segments.positions[k+axis]+(endpoint-.5)*segments.vectors[k+axis];lines[at+3]=Math.min(1,Math.log(1+Math.abs(segments.vectors[k+3])/(Math.PI*segments.positions[k+3]))/Math.log(41));}}
      p=this.programs.core;gl.useProgram(p);gl.bindVertexArray(this.coreVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.coreBuffer);gl.bufferData(gl.ARRAY_BUFFER,lines,gl.DYNAMIC_DRAW);gl.uniformMatrix4fv(gl.getUniformLocation(p,'matrix'),false,matrix);gl.drawArrays(gl.LINES,0,segments.count*2);gl.bindVertexArray(this.emptyVAO);}
    gl.disable(gl.BLEND);p=this.use('blur');gl.bindFramebuffer(gl.FRAMEBUFFER,this.blurA.fbo);gl.viewport(0,0,this.blurA.w,this.blurA.h);this.sampler(p,'source',this.scene.texture,0);gl.uniform2f(gl.getUniformLocation(p,'direction'),2/w,0);gl.uniform1i(gl.getUniformLocation(p,'threshold'),1);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.blurB.fbo);this.sampler(p,'source',this.blurA.texture,0);gl.uniform2f(gl.getUniformLocation(p,'direction'),0,2/this.blurA.h);gl.uniform1i(gl.getUniformLocation(p,'threshold'),0);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);p=this.use('composite');this.sampler(p,'scene',this.scene.texture,0);this.sampler(p,'bloom',this.blurB.texture,1);gl.drawArrays(gl.TRIANGLES,0,3);this.lastDrawMs=performance.now()-started;this.lastDrawResult={drawn:true,submissionMs:this.lastDrawMs};
  }
}
