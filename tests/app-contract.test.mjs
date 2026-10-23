import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {VortexCamera} from '../src/vortex-camera.js';
test('新旧画场的静态控件与事件绑定完整，不因入口迁移遗漏控件',async()=>{
  for(const [entry,module] of [['index.html','src/vortex-main.js'],['equations.html','src/equation-app.js'],['lab-2d.html','src/main.js']]){
    const html=await readFile(new URL(`../${entry}`,import.meta.url),'utf8'),js=await readFile(new URL(`../${module}`,import.meta.url),'utf8');
    const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),m=>m[1]);assert.equal(new Set(ids).size,ids.length);
    for(const [,id] of js.matchAll(/\$\('([a-zA-Z][\w-]+)'\)/g))assert.ok(ids.includes(id),`${entry} 缺少 ${id}`);
  }
});
test('指针在相机平面上的映射与投影互相一致，窄屏也保持一致',()=>{
  const camera=new VortexCamera();for(const frame of [null,{x:.12,y:.17,scale:1.4},{x:0,y:.28,scale:1.25}])for(const [w,h] of [[1200,800],[390,844]]){
    camera.frame=frame;
    const point=camera.planePoint(w*.3,h*.6,w,h),screen=camera.project(point,w,h);
    assert.ok(Math.abs(screen.x-w*.3)<1e-3&&Math.abs(screen.y-h*.6)<1e-3);
  }
});
