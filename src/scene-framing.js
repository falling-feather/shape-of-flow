import {VORTEX_VIEW} from './vortex-model.js';
import {GAUSSIAN_VIEW} from './gaussian-vortex.js';

/** Fits the default view on both axes. User camera distance still controls zoom. */
export function sceneFrame(camera,observation,rect,width,height){
  const model=observation.model;
  const normalizedHeight=observation.family==='ring'?Math.min(model.metrics.span,3.2)*1.25:3.2;
  const portrait=Math.max(1,height/width*1.1);
  const stageExtent=Math.max(1,Math.min(rect.width,rect.height));
  const defaultDistance=observation.family==='ring'?VORTEX_VIEW.distance:GAUSSIAN_VIEW.distance;
  return {x:2*(rect.left+rect.width/2)/width-1,y:1-2*(rect.top+rect.height/2)/height,
    scale:normalizedHeight*height/(2*Math.tan(camera.fov/2)*defaultDistance*portrait*stageExtent)};
}
