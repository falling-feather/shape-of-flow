export const OBSERVATION_INTERVAL=4;

/** GPU buffers describe the displayed observation, which may be historical.
 * Only the live buffer may be paired with the latest model. Capture lazily.
 */
export function captureObservation(frames,tick,createObservation,{force=false,viewIndex=null}={}){
  if(viewIndex!==null)return null;
  const last=frames.at(-1);
  if(!force&&(tick%OBSERVATION_INTERVAL!==0||last?.model.tick===tick))return null;
  const frame=createObservation();
  if(frame.model.tick!==tick)throw new Error('模型快照与观察时刻不一致。');
  if(last?.model.tick===tick)frames[frames.length-1]=frame;else frames.push(frame);
  return frame;
}
