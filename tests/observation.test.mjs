import test from 'node:test';
import assert from 'node:assert/strict';
import {captureObservation} from '../src/observation-history.js';

test('回看时不读取历史 GPU 图像去覆盖最新模型快照',()=>{
  const frames=[];let reads=0;
  const observation=tick=>{reads++;return {model:{tick},particles:new Float32Array([tick])};};
  captureObservation(frames,4,()=>observation(4));
  captureObservation(frames,8,()=>observation(8));
  const latest=frames.at(-1);
  captureObservation(frames,8,()=>observation(4),{force:true,viewIndex:0});
  assert.equal(reads,2);assert.equal(frames.at(-1),latest);assert.equal(latest.particles[0],8);
});

test('同一步普通记录不重复读 GPU，实时强制记录可更新输入元数据',()=>{
  const frames=[];let reads=0;
  const snapshot=input=>{reads++;return {model:{tick:4,input},particles:new Float32Array([4])};};
  captureObservation(frames,4,()=>snapshot(true));
  const keyObservation=frames[0];
  captureObservation(frames,4,()=>snapshot(false));
  assert.equal(reads,1);assert.equal(frames[0].model.input,true);
  captureObservation(frames,4,()=>snapshot(false),{force:true});
  assert.equal(reads,2);assert.equal(frames.length,1);assert.equal(frames[0].model.input,false);
  assert.equal(keyObservation.model.input,true);
});
