import test from 'node:test';
import assert from 'node:assert/strict';
import {LearningGuide} from '../src/learning-guide.js';
import {LearningJournal} from '../src/learning-core.js';
import {VortexWorld} from '../src/vortex-model.js';

test('暂停后的相同读数保留已有显示节点，观测变化时才更新',t=>{
  const original=globalThis.document,nodes=new Map();
  for(const id of ['learning-live','learning-current-numbers','learning-comparison-numbers']){
    const element={writes:0},values={textContent:'',innerHTML:''};
    for(const key of Object.keys(values))Object.defineProperty(element,key,{get:()=>values[key],set:value=>{element.writes++;values[key]=value;}});
    nodes.set(id,element);
  }
  globalThis.document={getElementById:id=>nodes.get(id)};t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});
  const guide=Object.create(LearningGuide.prototype);Object.assign(guide,{active:true,journal:new LearningJournal(),screen:'observe'});
  const observation={family:'ring',model:new VortexWorld('ring').snapshot()};
  guide.live(observation);const writes=()=>[...nodes.values()].reduce((total,node)=>total+node.writes,0),first=writes();
  guide.live(observation);assert.equal(writes(),first,'相同观察不应重建显示节点');
  observation.model.metrics.time=2.5;guide.live(observation);
  assert.equal(writes(),first+1);assert.match(nodes.get('learning-current-numbers').innerHTML,/2\.50/);
});
