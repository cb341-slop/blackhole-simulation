import assert from 'node:assert/strict';
import {inspectPixelRay} from '../public/black-hole-simulation-static/ray-inspector.js';
import {createDiskPin,projectDiskPin} from '../public/black-hole-simulation-static/disk-pins.js';
import {projectSurfacePoint} from '../public/black-hole-simulation-static/surface-normals.js';
let checks=0,pins=0,undersides=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),unit=a=>a.map(v=>v/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function basis(camera){const forward=unit(camera.map(v=>-v)),right=unit(cross(forward,[0,1,0]));return {camera,forward,right,up:cross(right,forward)};}
const viewport={width:1000,height:600},initial=basis([4,5,17]);
const base={mass:1,spin:0,charge:1.35,blackhole:true,compare:true,lensing:true,disk:true,diskRadius:14,cubes:[],fov:55,time:0};
for(const model of [{blackhole:true,spin:0},{blackhole:true,spin:.8},{blackhole:false,spin:0}]){
 const state={...base,...model};
 for(const point of [{x:50,y:130},{x:70,y:330},{x:450,y:130}]){
  const selected=inspectPixelRay(state,initial,{...point,...viewport,includeHorizon:true});
  const pin=createDiskPin(selected,point,state,initial,viewport);if(!pin)continue;
  pins++;if(pin.hit.face==='BOTTOM')undersides++;
  const source=JSON.stringify(pin.hit),branch=pin.branch;
  let lastPoint=null;
  for(let i=0;i<=8;i++){
   const b=basis([4+i*.15,5+i*.02,17-i*.03]);
   const result=projectDiskPin(pin,state,b,viewport);
   check(result,'Pinned primary/secondary source continues through small camera moves');
   check(JSON.stringify(pin.hit)===source&&pin.branch===branch,'Reprojection retains immutable source coordinates, face, and image branch');
   // Independently inspect the solved pixel. No screen-coordinate retention or
   // invented firstHit object can satisfy this source-position assertion.
   const ray=inspectPixelRay(state,b,{...result.point,...viewport,includeHorizon:true});
   check(ray.firstHit?.kind==='disk'&&Math.hypot(...sub(ray.firstHit.position,pin.hit.position))<1e-5,'Solved lensed pixel really lands on the originally clicked disk point');
   check(ray.firstHit.face===pin.hit.face,'Underside pins stay on the selected face after motion');
   lastPoint=result.point;
  }
  check(Math.hypot(lastPoint.x-point.x,lastPoint.y-point.y)>2,'Marker moves in the image rather than staying glued to its click pixel');
  const moved=basis([5.2,5.16,16.76]);
  state.fov=70;
  const resized={width:1400,height:720},res=projectDiskPin(pin,state,moved,resized);
  check(res,'Source reprojects after simultaneous FOV and viewport changes');
  const resizedRay=inspectPixelRay(state,moved,{...res.point,...resized});
  check(resizedRay.firstHit?.kind==='disk'&&Math.hypot(...sub(resizedRay.firstHit.position,pin.hit.position))<1e-5,'Resized marker still traces to the fixed source');
  state.time=100;
  const animated=projectDiskPin(pin,state,moved,resized);
  check(Math.hypot(animated.point.x-res.point.x,animated.point.y-res.point.y)<1e-6&&JSON.stringify(pin.hit)===source,'Disk texture animation does not move a spatially pinned source');
  state.compare=false;state.lensing=false;
  const straight=projectDiskPin(pin,state,moved,resized),expected=projectSurfacePoint(pin.hit.position,moved,{...resized,fov:state.fov});
  check(Math.hypot(straight.point.x-expected.x,straight.point.y-expected.y)<1e-10,'Turning lensing off uses the actual fixed point perspective projection');
  state.compare=true;state.lensing=true;state.fov=55;state.time=0;
 }
}
check(pins>=5&&undersides>0,'Exercise primary, underside, Kerr, and naked-singularity pins');
check(createDiskPin({firstHit:null,points:[]},{x:0,y:0},base,initial,viewport)===null,'Sky click cannot invent a disk pin');
check(createDiskPin({firstHit:{kind:'cube'},points:[]},{x:0,y:0},base,initial,viewport)===null,'Foreground cube click cannot pin a hidden disk');
// A source selected directly in the right image can also be pinned and imaged
// through the lens; its stored point must remain the directly selected one.
const point={x:800,y:440},directRay=inspectPixelRay(base,initial,{...point,...viewport});
const directPin=createDiskPin(directRay,point,base,initial,viewport);
check(directPin&&directPin.branch===null,'Straight-view selection initially has no assumed lensed image branch');
const found=projectDiskPin(directPin,base,initial,viewport);
check(found&&Math.hypot(...sub(inspectPixelRay(base,initial,{...found.point,...viewport}).firstHit.position,directPin.hit.position))<1e-5,'Right-view disk click acquires a valid corresponding lensed source image');
const testPoint={x:50,y:130},testRay=inspectPixelRay(base,initial,{...testPoint,...viewport});
const persistent=createDiskPin(testRay,testPoint,base,initial,viewport),fixedSource=JSON.stringify(persistent.hit);
const outside=projectDiskPin(persistent,{...base,fov:25},initial,viewport);
check(outside&&!outside.onScreen,'Narrowing FOV reports the actual source image outside the viewport without clamping it to the screen');
const returned=projectDiskPin(persistent,base,initial,viewport);
check(returned.onScreen&&Math.hypot(returned.point.x-testPoint.x,returned.point.y-testPoint.y)<1e-5&&JSON.stringify(persistent.hit)===fixedSource,'Off-screen source reappears at the right pixel when the camera returns');
const blocked=projectDiskPin(persistent,{...base,cubes:[{id:1,position:testRay.points[2],size:.5}]},initial,viewport);
check(blocked?.ray.occlusion==='cube'&&JSON.stringify(persistent.hit)===fixedSource,'Foreground occlusion preserves the fixed disk source instead of pinning the blocker');
console.log(`${checks} disk-pin checks passed: ${pins} world-space pins, including ${undersides} underside images, camera motion, resize, FOV, animation, and straight/lensed selection.`);
