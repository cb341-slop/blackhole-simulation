import {inspectPixelRay} from './ray-inspector.js?v=12';
import {projectSurfacePoint} from './surface-normals.js?v=20';
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=a=>a.map(v=>v/(Math.hypot(...a)||1));
const copyBasis=b=>Object.fromEntries(Object.entries(b).map(([k,v])=>[k,[...v]]));

// Count every equatorial crossing, including those through the central hole.
// Keeping this ordinal follows the clicked image branch rather than jumping
// between the primary disk and its higher-order images during camera motion.
function diskCrossings(ray){
 const crossings=[];
 for(let i=1;i<ray.points.length;i++){
  const a=ray.points[i-1],b=ray.points[i];
  if(!((a[1]>0&&b[1]<=0)||(a[1]<0&&b[1]>=0)))continue;
  const t=-a[1]/(b[1]-a[1]);
  crossings.push({position:a.map((v,j)=>v+t*(b[j]-v)),face:b[1]<a[1]?'TOP':'BOTTOM'});
 }
 return crossings;
}

export function createDiskPin(ray,point,state,basis,{width,height}){
 const hit=ray.firstHit;if(hit?.kind!=='disk')return null;
 const crossings=diskCrossings(ray);
 let branch=0,error=Infinity;
 crossings.forEach((crossing,i)=>{const d=Math.hypot(...sub(crossing.position,hit.position));if(d<error){branch=i;error=d;}});
 if(!Number.isFinite(error))return null;
 const imageWidth=state.compare?width/2:width;
 const localX=state.compare&&point.x>=imageWidth?point.x-imageWidth:point.x;
 return {
  hit:Object.freeze({...hit,position:Object.freeze([...hit.position])}),branch:ray.lensing?branch:null,
  seed:{u:localX/imageWidth,v:point.y/height},
  last:ray.lensing?{basis:copyBasis(basis),direction:[...ray.direction]}:null
 };
}

// Invert the disk's ray map with a bounded Newton solve. The immutable target
// is the clicked XYZ point; only the camera pixel is allowed to change.
export function projectDiskPin(pin,state,basis,{width,height}){
 const imageWidth=state.compare?width/2:width;
 const onScreen=p=>p.x>=0&&p.x<imageWidth&&p.y>=0&&p.y<height;
 const direct=projectSurfacePoint(pin.hit.position,basis,{width:imageWidth,height,fov:state.fov});
 if(!(state.compare||state.lensing))return direct?{point:direct,ray:{firstHit:pin.hit,lensing:false},onScreen:direct.onScreen}:null;
 const localState={...state,compare:false,lensing:true};
 const trace=point=>inspectPixelRay(localState,basis,{...point,width:imageWidth,height,includeHorizon:true});
 const crossing=(ray,branch)=>{
  const hit=diskCrossings(ray)[branch];return hit?.face===pin.hit.face?hit:null;
 };
 const seed={x:pin.seed.u*imageWidth,y:pin.seed.v*height},seeds=[];
 if(pin.last){
  const oldDirect=unit(sub(pin.hit.position,pin.last.basis.camera)),newDirect=unit(sub(pin.hit.position,basis.camera));
  const estimate=unit(pin.last.direction.map((v,i)=>v+newDirect[i]-oldDirect[i]));
  const predicted=projectSurfacePoint(basis.camera.map((v,i)=>v+estimate[i]),basis,{width:imageWidth,height,fov:state.fov});
  if(predicted)seeds.push(predicted);
 }
 seeds.push(seed);if(direct)seeds.push(direct);
 // A pin selected in the straight view has no lensed branch yet. Try primary
 // rays just outside its direct projection if that direction is captured.
 if(pin.branch===null&&direct)for(const scale of [1.3,1.7,2.3])seeds.push({x:imageWidth/2+(direct.x-imageWidth/2)*scale,y:height/2+(direct.y-height/2)*scale});
 const tolerance=1e-6*Math.max(state.mass,.1),step=.3;
 for(const start of seeds){
  let point={x:start.x,y:start.y},branch=pin.branch??0;
  for(let iteration=0;iteration<10;iteration++){
   const ray=trace(point),hit=crossing(ray,branch);if(!hit)break;
   const residual=[hit.position[0]-pin.hit.position[0],hit.position[2]-pin.hit.position[2]];
   if(Math.hypot(...residual)<tolerance){
    pin.branch=branch;pin.seed={u:point.x/imageWidth,v:point.y/height};pin.last={basis:copyBasis(basis),direction:[...ray.direction]};
    const first=ray.firstHit;
    const occlusion=first?.kind==='cube'?'cube':first?.kind==='disk'&&Math.hypot(...sub(first.position,pin.hit.position))>tolerance*3?'foreground disk':null;
    return {point,ray:{...ray,firstHit:pin.hit,occlusion},onScreen:onScreen(point)};
   }
   const hx=crossing(trace({x:point.x+step,y:point.y}),branch),hy=crossing(trace({x:point.x,y:point.y+step}),branch);
   if(!hx||!hy)break;
   const jx=[(hx.position[0]-hit.position[0])/step,(hx.position[2]-hit.position[2])/step];
   const jy=[(hy.position[0]-hit.position[0])/step,(hy.position[2]-hit.position[2])/step];
   const det=jx[0]*jy[1]-jy[0]*jx[1],size=Math.hypot(...jx)*Math.hypot(...jy);
   if(!Number.isFinite(det)||size<1e-16||Math.abs(det)/size<1e-7)break;
   let dx=(-jy[1]*residual[0]+jy[0]*residual[1])/det,dy=(jx[1]*residual[0]-jx[0]*residual[1])/det;
   const clamp=Math.min(1,Math.max(15,height*.055)/Math.hypot(dx,dy));dx*=clamp;dy*=clamp;
   point={x:point.x+dx,y:point.y+dy};
   if(!Number.isFinite(point.x+point.y)||Math.abs(point.x)>width*4||Math.abs(point.y)>height*4)break;
  }
 }
 return null;
}
