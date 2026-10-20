import {traceRay} from './geometry.js';
import {diskUVAt,diskUVLabel} from './disk-uv.js';
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
 const trace=traceRay(basis.camera,direction,state.mass,state.blackhole?0:state.charge,{lensing});
 const inner=state.blackhole?6:2.15;let firstHit=null,crossings=0;
 for(let i=0;i<trace.points.length-1;i++){
  const a=trace.points[i],b=trace.points[i+1];let hit=null,best=Infinity;
  if(state.disk&&((a[1]>0&&b[1]<=0)||(a[1]<0&&b[1]>=0))&&Math.abs(b[1]-a[1])>1e-12){
   const t=-a[1]/(b[1]-a[1]),p=a.map((v,k)=>v+(b[k]-v)*t),radius=Math.hypot(p[0],p[2])/state.mass;
   if(radius>inner&&radius<state.diskRadius){
    crossings++;const uv=diskUVAt(p[0]/state.mass,p[2]/state.mass,inner,state.diskRadius,state.time,state.diskUVRotate),sector=Math.min(7,Math.floor(uv.u*8)),band=Math.min(3,Math.floor(uv.v*4));
    best=t;hit={kind:'disk',position:p,radius,face:b[1]<a[1]?'TOP':'BOTTOM',...uv,label:diskUVLabel(sector,band)};
   }
  }
  if(!firstHit){for(const cube of state.cubes){const t=segmentBoxHit(a,b,cube);if(t!==null&&t<best){best=t;hit={kind:'cube',id:cube.id,position:a.map((v,k)=>v+(b[k]-v)*t)};}}if(hit)firstHit=hit;}
 }
 return {...trace,firstHit,crossings,lensing,direction};
}
