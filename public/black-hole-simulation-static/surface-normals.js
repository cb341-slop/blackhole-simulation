import {kerrRadius,horizonRadius} from './kerr.js?v=6';
import {segmentBoxHit,inspectPixelRay} from './ray-inspector.js?v=12';
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const sub=(a,b)=>a.map((value,i)=>value-b[i]);
const unit=a=>a.map(value=>value/(Math.hypot(...a)||1));

// Euclidean coordinate-space normals for debug annotation, not spacetime
// four-normals or vectors parallel-transported through the lens.
export function surfaceNormalForHit(hit,mass=1,spin=0){
 if(hit?.kind==='disk')return hit.face==='BOTTOM'?[0,-1,0]:[0,1,0];
 if(hit?.kind!=='horizon'||!hit.position?.every(Number.isFinite))return null;
 const p=hit.position,a=spin*mass,r=kerrRadius(p,a),r2=r*r;
 if(r2<1e-16||Math.hypot(...p)<1e-12)return null;
 // Constant-r oblate surfaces: (x²+z²)/(r²+a²) + y²/r² = 1.
 const gradient=[p[0]/(r2+a*a),p[1]/r2,p[2]/(r2+a*a)],length=Math.hypot(...gradient);
 return gradient.map(value=>value/length);
}

export function projectNormal(normal,basis,length=52,position=null){
 if(!position)return {dx:length*dot(normal,basis.right),dy:-length*dot(normal,basis.up),towardCamera:-dot(normal,basis.forward)};
 const delta=sub(position,basis.camera),depth=dot(delta,basis.forward);
 if(depth<=1e-9)return null;
 // Perspective derivative of the actual source point, including off-axis rays.
 const along=dot(normal,basis.forward),dx=dot(normal,basis.right)-dot(delta,basis.right)*along/depth;
 const dy=-dot(normal,basis.up)+dot(delta,basis.up)*along/depth;
 return displayNormal(dx,dy,-dot(normal,unit(delta)),length);
}

function displayNormal(dx,dy,towardCamera,length){
 const size=Math.hypot(dx,dy),transverse=Math.sqrt(Math.max(0,1-towardCamera*towardCamera));
 if(size<1e-12||transverse<1e-8)return {dx:0,dy:0,towardCamera};
 return {dx:dx/size*length*transverse,dy:dy/size*length*transverse,towardCamera};
}

// Locate the selected hit on its own traced image branch. A source screen is
// perpendicular to the local ray tangent, not to the observer's view direction.
function sourceFrame(ray){
 const p=ray.firstHit?.position;if(!p||!ray.points?.length)return null;
 let best=null,travel=0;
 for(let i=1;i<ray.points.length;i++){
  const a=ray.points[i-1],delta=sub(ray.points[i],a),size=Math.hypot(...delta);if(size<1e-12)continue;
  const t=Math.max(0,Math.min(1,dot(sub(p,a),delta)/(size*size)));
  const error=Math.hypot(...p.map((value,j)=>value-a[j]-t*delta[j]));
  if(!best||error<best.error)best={position:p,tangent:unit(delta),travel:travel+t*size,error};
  travel+=size;
 }
 return best;
}

function sourceScreenIntersection(ray,frame,mass){
 let travel=0,best=null;
 for(let i=1;i<ray.points.length;i++){
  const a=ray.points[i-1],delta=sub(ray.points[i],a),size=Math.hypot(...delta);if(size<1e-12)continue;
  const denominator=dot(delta,frame.tangent);if(Math.abs(denominator)<1e-12){travel+=size;continue;}
  const t=dot(sub(frame.position,a),frame.tangent)/denominator;
  // Neighboring captured rays may stop one step short of the selected source
  // screen. Only extend their final secant by at most two integration segments.
  const endpoint=i===ray.points.length-1&&ray.status==='horizon';
  if(t>=0&&t<=(endpoint?3:1)){
   const point=a.map((value,j)=>value+t*delta[j]),gap=Math.abs(travel+t*size-frame.travel);
   if(gap<Math.max(mass,frame.travel*.05)&&Math.hypot(...sub(point,frame.position))<Math.max(mass*.5,Math.hypot(...frame.position)*.1)&&(!best||gap<best.gap))best={point,gap};
  }
  travel+=size;
 }
 return best?.point??null;
}

// Local inverse ray-bundle map: a small source-space vector is projected onto
// the source screen, then mapped back into this particular lensed image. This
// images a virtual normal marker; it is not parallel transport of a 4-vector.
export function projectLensedNormal(normal,ray,state,basis,{x,y,width,height,length=52,step=.35}){
 if(!ray.lensing)return projectNormal(normal,basis,length,ray.firstHit?.position);
 const frame=sourceFrame(ray);if(!frame||frame.error>1e-5*Math.max(state.mass,1))return null;
 const localState={...state,compare:false,lensing:true},imageWidth=state.compare?width/2:width;
 const sample=(dx,dy)=>sourceScreenIntersection(inspectPixelRay(localState,basis,{x:x+dx,y:y+dy,width:imageWidth,height}),frame,state.mass);
 const samples=[sample(-step,0),sample(step,0),sample(0,-step),sample(0,step)];
 if(samples.some(p=>!p))return null;
 const jx=sub(samples[1],samples[0]).map(v=>v/(2*step)),jy=sub(samples[3],samples[2]).map(v=>v/(2*step));
 const a=dot(jx,jx),b=dot(jx,jy),c=dot(jy,jy),det=a*c-b*b;
 // At a caustic the inverse is undefined. Report this rather than substituting
 // the straight arrow or allowing numerical noise to choose its direction.
 if(!Number.isFinite(det)||a*c<=1e-24||det/(a+c)**2<1e-8)return null;
 const nx=dot(jx,normal),ny=dot(jy,normal),dx=(c*nx-b*ny)/det,dy=(a*ny-b*nx)/det;
 const projection=displayNormal(dx,dy,-dot(normal,frame.tangent),length);
 return {...projection,sourceTangent:frame.tangent};
}

// Inverse of inspectPixelRay's undistorted perspective camera. This projects
// the selected world point, rather than tracing an unrelated comparison pixel.
export function projectSurfacePoint(position,basis,{width,height,fov,offsetX=0}){
 if(!position?.every(Number.isFinite)||width<=0||height<=0)return null;
 const delta=position.map((value,i)=>value-basis.camera[i]),depth=dot(delta,basis.forward);
 if(depth<=1e-9)return null;
 const scale=height/(2*Math.tan(fov*Math.PI/360)*depth);
 const localX=width/2+dot(delta,basis.right)*scale,y=height/2-dot(delta,basis.up)*scale;
 return {x:offsetX+localX,y,depth,onScreen:localX>=0&&localX<width&&y>=0&&y<height};
}

// Visibility in the straight-ray view only. The selected normal is retained
// even if its source point is behind a different surface in that image.
export function straightSurfaceOcclusion(hit,state,basis){
 if(!hit?.position)return null;
 const from=basis.camera,to=hit.position,delta=to.map((value,i)=>value-from[i]);
 for(const cube of state.cubes){const t=segmentBoxHit(from,to,cube);if(t!==null&&t<1-1e-6)return 'cube';}
 if(state.blackhole&&hit.kind==='disk'){
  const spin=state.spin||0,r=horizonRadius(spin)*state.mass,a=spin*state.mass;
  const inv=[1/(r*r+a*a),1/(r*r),1/(r*r+a*a)];
  const A=delta.reduce((sum,value,i)=>sum+value*value*inv[i],0);
  const B=2*delta.reduce((sum,value,i)=>sum+value*from[i]*inv[i],0);
  const C=from.reduce((sum,value,i)=>sum+value*value*inv[i],0)-1,discriminant=B*B-4*A*C;
  if(A>0&&discriminant>=0){
   const roots=[(-B-Math.sqrt(discriminant))/(2*A),(-B+Math.sqrt(discriminant))/(2*A)];
   if(C<=0||roots.some(t=>t>=0&&t<1-1e-6))return 'horizon';
  }
 }
 const n=surfaceNormalForHit(hit,state.mass,state.blackhole?state.spin:0);
 if(n&&dot(n,from.map((value,i)=>value-to[i]))<0)return hit.kind==='disk'?'back-facing disk face':'far side of horizon';
 return null;
}
