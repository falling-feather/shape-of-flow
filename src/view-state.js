export const VIEW_BOUNDS=Object.freeze({elevation:1.25,minDistance:2.3,maxDistance:11,maxAzimuth:10000});

/** Only validated camera values may be assigned from an imported document. */
export function normalizeView(view,{allowSkeleton=true}={}){
  const bounds=VIEW_BOUNDS;
  if(!view||!Number.isFinite(view.azimuth)||Math.abs(view.azimuth)>bounds.maxAzimuth
    ||!Number.isFinite(view.elevation)||Math.abs(view.elevation)>bounds.elevation
    ||!Number.isFinite(view.distance)||view.distance<bounds.minDistance||view.distance>bounds.maxDistance
    ||(allowSkeleton&&typeof view.skeleton!=='boolean'))throw new Error('观察视角不合法。');
  return {azimuth:view.azimuth,elevation:view.elevation,distance:view.distance,skeleton:allowSkeleton?view.skeleton:false};
}
