import {iscoRadius} from './orbits.js?v=6';
import {kerrRadius} from './kerr.js?v=6';
import {horizonUVAt} from './horizon-uv.js?v=6';
import {traceRay} from './geometry.js?v=6';
import {diskUVAt,diskUVLabel} from './disk-uv.js?v=6';
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),norm=a=>mul(a,1/(Math.hypot(...a)||1));

export function segmentBoxHit(a,b,box){
 let enter=0,exit=1;
 for(let i=0;i<3;i++){
  const d=b[i]-a[i],lo=box.position[i]-box.size/2,hi=box.position[i]+box.size/2;
  if(Math.abs(d)<1e-12){if(a[i]<lo||a[i]>hi)return null;continue;}
  const t0=(lo-a[i])/d,t1=(hi-a[i])/d;enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));if(exit<enter)return null;
 }return enter;
}

export function inspectPixelRay(state,basis,{x,y,width,height}){
 const half=state.compare?width/2:width,second=state.compare&&x>=half,localX=second?x-half:x;
 const sx=(localX/half*2-1)*half/height,sy=1-y/height*2,tan=Math.tan(state.fov*Math.PI/360);
 const direction=norm(add(basis.forward,add(mul(basis.right,sx*tan),mul(basis.up,sy*tan))));
 const lensing=state.compare?!second:state.lensing;
 const trace=traceRay(basis.camera,direction,state.mass,state.blackhole?0:state.charge,{lensing,spin:state.blackhole?(state.spin||0):0});
 const inner=state.blackhole?iscoRadius(state.spin||0):2.15;let firstHit=null,crossings=0;
 for(let i=0;i<trace.points.length-1;i++){
  const a=trace.points[i],b=trace.points[i+1];let hit=null,best=Infinity;
  if(state.disk&&((a[1]>0&&b[1]<=0)||(a[1]<0&&b[1]>=0))&&Math.abs(b[1]-a[1])>1e-12){
   const t=-a[1]/(b[1]-a[1]),p=a.map((v,k)=>v+(b[k]-v)*t),radius=(state.blackhole&&state.spin>0?kerrRadius(p,state.spin*state.mass):Math.hypot(p[0],p[2]))/state.mass;
   if(radius>inner&&radius<state.diskRadius){
    crossings++;const uv=diskUVAt(p[0]/state.mass,p[2]/state.mass,inner,state.diskRadius,state.time,state.diskUVRotate,state.blackhole&&state.spin>0?-1:1),sector=Math.min(7,Math.floor(uv.u*8)),band=Math.min(3,Math.floor(uv.v*4));
    best=t;hit={kind:'disk',position:p,radius,face:b[1]<a[1]?'TOP':'BOTTOM',...uv,label:diskUVLabel(sector,band)};
   }
  }
  if(!firstHit){for(const cube of state.cubes){const t=segmentBoxHit(a,b,cube);if(t!==null&&t<best){best=t;hit={kind:'cube',id:cube.id,position:a.map((v,k)=>v+(b[k]-v)*t)};}}if(hit)firstHit=hit;}
 }
 if(!firstHit&&state.blackhole&&state.horizonUV&&trace.status==='horizon'){const p=trace.points.at(-1),uv=horizonUVAt(p,state.mass,state.spin||0,state.time,state.horizonUVRotate);firstHit={kind:'horizon',position:p,radius:kerrRadius(p,(state.spin||0)*state.mass)/state.mass,...uv,label:String.fromCharCode(65+uv.sector)+(uv.band+1)};}
 return {...trace,firstHit,crossings,lensing,direction};
}
