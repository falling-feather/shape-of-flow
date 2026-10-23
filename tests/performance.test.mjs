import test from 'node:test';
import assert from 'node:assert/strict';
import {PerformanceMeter} from '../src/performance-meter.js';
import {sceneFrame} from '../src/scene-framing.js';
import {VortexCamera} from '../src/vortex-camera.js';
import {VortexWorld} from '../src/vortex-model.js';

test('性能记录只统计可见活动帧，暂停与后台不冒充稳定帧率',()=>{
  const meter=new PerformanceMeter();meter.start('test',{viewport:[1024,640]},0,1000);
  for(let t=0;t<=500;t+=20)meter.frame(t,{active:true,focused:t!==300,drawn:true,submissionMs:2,steps:2});
  meter.frame(600,{active:false});meter.frame(700,{active:true,visible:false});
  const report=meter.frame(1000,{active:false});
  assert.equal(report.meanFps,50);assert.equal(report.p95FrameMs,20);assert.equal(report.hiddenFrames,1);assert.equal(report.gpuTimeMeasured,false);
  assert.equal(report.unfocusedFrames,1);
});

test('画场中心对应未被控件遮挡的舞台，所有验收尺寸坐标一致',()=>{
  for(const [width,height] of [[1366,768],[1920,1080],[1024,640]]){
    const camera=new VortexCamera(),rect={left:280,top:100,width:width-312,height:height-300};
    camera.frame=sceneFrame(camera,{family:'gaussian'},rect,width,height);
    const point=camera.project([0,0,0],width,height);
    assert.ok(Math.abs(point.x-(rect.left+rect.width/2))<1e-3);assert.ok(Math.abs(point.y-(rect.top+rect.height/2))<1e-3);
  }
});

test('默认涡环在窄高画场完整入镜，不能只按舞台高度适配',()=>{
  for(const [width,height,rect]of [[981,1706,{left:310,top:104,width:643,height:1320}],[1366,768,{left:270,top:93,width:1072,height:450}]]){
    const camera=new VortexCamera(),model=new VortexWorld('ring').snapshot();
    camera.target=[...model.metrics.center];camera.fitScale=Math.max(1,model.metrics.span/3.2);
    camera.frame=sceneFrame(camera,{family:'ring',model},rect,width,height);
    const points=model.rings[0].points;
    for(let i=0;i<points.length;i+=3){const p=camera.project(Array.from(points.slice(i,i+3)),width,height);assert.ok(p.x>=rect.left&&p.x<=rect.left+rect.width&&p.y>=rect.top&&p.y<=rect.top+rect.height,`涡环越过画场边界：${p.x},${p.y}`);}
  }
});

test('自适应构图保持用户缩放的实际后果',()=>{
  const camera=new VortexCamera(),model=new VortexWorld('ring').snapshot(),rect={left:270,top:93,width:1072,height:450};
  camera.target=[...model.metrics.center];camera.frame=sceneFrame(camera,{family:'ring',model},rect,1366,768);
  const before=camera.project([0,1,0],1366,768),center=camera.project(model.metrics.center,1366,768);
  camera.zoom(-300);camera.frame=sceneFrame(camera,{family:'ring',model},rect,1366,768);
  const after=camera.project([0,1,0],1366,768);
  assert.ok(Math.hypot(after.x-center.x,after.y-center.y)>Math.hypot(before.x-center.x,before.y-center.y)*1.2);
});

test('后台不产生 RAF 时仍记录隐藏区间，不把该段当作可见活动长帧',()=>{
  const meter=new PerformanceMeter();meter.start('visibility',{},0,1000);
  meter.frame(0,{active:true});meter.frame(20,{active:true});
  meter.visibility(30,false);meter.visibility(930,true);
  meter.frame(940,{active:true});meter.frame(960,{active:true});
  const report=meter.frame(1000,{active:false});
  assert.equal(report.hiddenDurationMs,900);assert.equal(report.hiddenTransitions,1);
  assert.equal(report.activeMs,40);assert.equal(report.meanFps,50);
});

test('首个 RAF 早于点击事件的时间戳时，不计入采样开始前的间隔',()=>{
  const meter=new PerformanceMeter();meter.start('start-edge',{},15,100);
  meter.frame(10,{active:true});meter.frame(30,{active:true});
  const report=meter.frame(115,{active:false});assert.equal(report.activeMs,15);assert.ok(report.activeMs<=report.wallMs);
});
