import assert from 'node:assert/strict';
import {inspectPixelRay} from '../public/black-hole-simulation-static/ray-inspector.js';
import {projectSurfacePoint,straightSurfaceOcclusion,surfaceNormalForHit} from '../public/black-hole-simulation-static/surface-normals.js';

let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const unit=a=>a.map(v=>v/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function cameraBasis(camera){const forward=unit(camera.map(v=>-v)),right=unit(cross(forward,[0,1,0]));return {camera,forward,right,up:cross(right,forward)};}
const b=cameraBasis([4,5,17]),width=500,height=600;
// Build world points independently from known camera rays. Projection must
// recover the originating pixel, regardless of distance or field of view.
for(const fov of [25,55,100])for(const u of [.1,.3,.5,.8,.95])for(const v of [.15,.5,.85])for(const depth of [4,17,80]){
 const sx=(2*u-1)*width/height,sy=1-2*v,tan=Math.tan(fov*Math.PI/360);
 const direction=unit(b.forward.map((value,i)=>value+tan*(sx*b.right[i]+sy*b.up[i])));
 const position=b.camera.map((value,i)=>value+depth*direction[i]);
 const projected=projectSurfacePoint(position,b,{width,height,fov,offsetX:width});
 check(projected?.onScreen,'Forward camera-ray point remains on screen');
 check(Math.hypot(projected.x-(width+u*width),projected.y-v*height)<1e-9,'World-to-screen round trip recovers the exact straight pixel');
}
check(projectSurfacePoint(b.camera.map((v,i)=>v-b.forward[i]*5),b,{width,height,fov:55})===null,'Behind-camera point is rejected');
check(projectSurfacePoint([NaN,0,0],b,{width,height,fov:55})===null,'Invalid source point is rejected');
const outside=projectSurfacePoint(b.camera.map((v,i)=>v+b.forward[i]*5+b.right[i]*100),b,{width,height,fov:55});
check(outside&&!outside.onScreen&&outside.x>width,'Off-screen source is reported without moving it to an invented image location');

let mapped=0,shifted=0,occluded=0,backFacing=0;
for(const spin of [0,.8])for(const sign of [1,-1]){
 const basis=cameraBasis([4,sign*5,17]);
 const state={mass:1,charge:1.03,spin,blackhole:true,horizonUV:false,compare:true,lensing:true,disk:true,diskRadius:14,cubes:[],time:0,fov:55};
 for(const x of [70,80,160,250,340,420])for(const y of [120,200,280,300,330,360,440,520]){
  const selected=inspectPixelRay(state,basis,{x,y,width:1000,height,includeHorizon:true});
  if(selected.firstHit?.kind!=='disk')continue;
  const hit=selected.firstHit,point=projectSurfacePoint(hit.position,basis,{width,height,fov:55,offsetX:width});
  if(!point?.onScreen)continue;
  mapped++;
  if(Math.hypot(point.x-(x+width),point.y-y)>2)shifted++;
  const visibility=straightSurfaceOcclusion(hit,state,basis);
  const direct=inspectPixelRay(state,basis,{x:point.x,y:point.y,width:1000,height,includeHorizon:true});
  if(visibility==='horizon'){
   occluded++;
   check(direct.firstHit?.kind==='horizon','Occluded disk point projects behind the straight-view horizon');
  }else{
   check(direct.firstHit?.kind==='disk','Mapped visible disk position is a straight-view disk hit');
   check(distance(direct.firstHit.position,hit.position)<1e-7,'Mapped pixel reaches the original lensed surface point, not an unrelated ray hit');
   if(visibility==='back-facing disk face'){
    backFacing++;
    check(direct.firstHit.face!==hit.face,'Back-facing selected disk side is retained even though the direct camera sees the other face');
   }
  }
  check(Math.abs(Math.hypot(...surfaceNormalForHit(hit))-1)<1e-12,'Original source normal remains a unit vector');
 }
}
check(mapped>=10,'Exercise multiple actual lensed disk correspondences');
check(shifted>=10,'Corresponding surface pixels differ from simply copying screen coordinates');
check(occluded>0,'Exercise source points hidden by the horizon');
check(backFacing>0,'Exercise lensed images of the opposite disk face');
const basis=cameraBasis([0,5,17]),state={mass:1,spin:0,blackhole:true,cubes:[]};
const front={kind:'disk',position:[0,0,10],face:'TOP'};
check(straightSurfaceOcclusion(front,state,basis)===null,'Near disk point is directly visible');
check(straightSurfaceOcclusion({...front,face:'BOTTOM'},state,basis)==='back-facing disk face','Opposite selected face is marked back-facing');
check(straightSurfaceOcclusion({kind:'disk',position:[0,0,-10],face:'TOP'},state,basis)==='horizon','Far disk point is hidden by the black hole');
state.cubes=[{position:[0,2.5,13.5],size:1}];
check(straightSurfaceOcclusion(front,state,basis)==='cube','Foreground cube occlusion is reported');
console.log(`${checks} correspondence checks passed: camera round trips, ${mapped} lensed disk hits, ${shifted} displaced source pixels, ${occluded} horizon occlusions, ${backFacing} back-facing surfaces.`);
