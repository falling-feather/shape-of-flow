import test from 'node:test';
import assert from 'node:assert/strict';
import {VortexRenderer,TRACERS} from '../src/vortex-renderer.js';
import {VortexCamera} from '../src/vortex-camera.js';
import {VortexWorld} from '../src/vortex-model.js';

test('新实验仅播种一个有效历史层，反复初始化不会沿用旧实验的轨迹',()=>{
  const model=new VortexWorld('ring'),renderer=Object.create(VortexRenderer.prototype);
  let copies=0;renderer.integrate=()=>{};
  renderer.copyHistory=function(){copies++;this.head=(this.head+1)%TRACERS.history;this.available++;};
  renderer.initialize(model);assert.equal(copies,1);assert.equal(renderer.available,1);assert.equal(renderer.head,0);
  renderer.available=TRACERS.history;renderer.head=57;
  renderer.initialize(model);assert.equal(copies,2);assert.equal(renderer.available,1);assert.equal(renderer.head,0);
});

test('只提交有效的轨迹段，历史未充满时不绘制透明的无效段',()=>{
  const model=new VortexWorld('ring').snapshot();
  for(const available of [1,2,48,TRACERS.history]){
    const calls=[],gl=new Proxy({drawArraysInstanced:(...args)=>calls.push(args),getUniformLocation:()=>0},{get:(object,key)=>object[key]??(()=>{})});
    const renderer=Object.create(VortexRenderer.prototype);
    Object.assign(renderer,{gl,canvas:{width:1366,height:768},camera:new VortexCamera(),ratio:1,stateRevision:1,skeleton:false,available,head:available-1,particleTextures:[{}],read:0,scene:{fbo:{}},blurA:{fbo:{},w:683,h:384},blurB:{fbo:{}},resize:()=>{},sampler:()=>{},use:()=>({})});
    renderer.draw(model);
    assert.equal(calls.length,available>1?1:0);
    if(available>1){assert.equal(calls[0][2],(available-1)*6);assert.equal(calls[0][3],4096);}
  }
});
