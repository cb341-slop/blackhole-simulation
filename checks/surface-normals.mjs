import assert from 'node:assert/strict';
import {surfaceNormalForHit,projectNormal} from '../public/black-hole-simulation-static/surface-normals.js';
import {inspectPixelRay} from '../public/black-hole-simulation-static/ray-inspector.js';
import {kerrRadius,horizonRadius} from '../public/black-hole-simulation-static/kerr.js';

let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=a=>a.map(v=>v/Math.hypot(...a));
check(JSON.stringify(surfaceNormalForHit({kind:'disk',face:'TOP'}))==='[0,1,0]','Disk top points +Y');
check(JSON.stringify(surfaceNormalForHit({kind:'disk',face:'BOTTOM'}))==='[0,-1,0]','Disk bottom points -Y');
for(const hit of [null,{kind:'cube'},{kind:'horizon',position:[0,0,0]},{kind:'horizon',position:[NaN,0,1]}])check(surfaceNormalForHit(hit)===null,'No fabricated normal for sky, cubes, or invalid positions');
// Independent finite differences of the spheroidal radius validate the normal.
for(const mass of [.3,1,2.5])for(const spin of [0,.5,.98])for(const theta of [.1,.7,1.3,2.1,3]){
 const r=horizonRadius(spin)*mass,rho=Math.hypot(r,spin*mass),p=[rho*Math.sin(theta)*.6,r*Math.cos(theta),rho*Math.sin(theta)*.8];
 const n=surfaceNormalForHit({kind:'horizon',position:p},mass,spin),h=1e-5*mass;
 const grad=p.map((_,axis)=>{const a=[...p],b=[...p];a[axis]-=h;b[axis]+=h;return (kerrRadius(b,spin*mass)-kerrRadius(a,spin*mass))/(2*h);});
 check(Math.abs(Math.hypot(...n)-1)<1e-12,'Unit horizon normal');
 check(dot(n,unit(grad))>1-1e-10,'Normal agrees with independent gradient of Kerr radius');
 check(dot(n,p)>0,'Horizon normal points outward');
}
const camera=[0,5,17],forward=unit(camera.map(v=>-v)),right=[1,0,0],up=[0,-forward[2],forward[1]],basis={camera,forward,right,up};
for(const normal of [[0,1,0],[0,-1,0],forward,forward.map(v=>-v),right]){
 const p=projectNormal(normal,basis);
 check(Math.abs((p.dx*p.dx+p.dy*p.dy)/52**2+p.towardCamera**2-1)<1e-12,'Projection preserves transverse/depth decomposition');
}
check(Math.hypot(...Object.values(projectNormal(forward,basis)).slice(0,2))<1e-10,'Face-on normal uses depth marker rather than invented screen direction');
const state={fov:55,mass:1,charge:1.03,spin:0,blackhole:true,horizonUV:false,compare:true,lensing:false,disk:false,diskRadius:14,cubes:[],time:0};
for(const spin of [0,.8]){
 state.spin=spin;
 const left=inspectPixelRay(state,basis,{x:250,y:300,width:1000,height:600,includeHorizon:true});
 const rightRay=inspectPixelRay(state,basis,{x:750,y:300,width:1000,height:600,includeHorizon:true});
 check(left.lensing&&!rightRay.lensing,'Comparison uses lensed left and straight right even when global lensing is off');
 check(left.direction.every((v,i)=>Math.abs(v-rightRay.direction[i])<1e-12),'Corresponding comparison pixels share initial camera direction');
 check(left.firstHit?.kind==='horizon'&&rightRay.firstHit?.kind==='horizon','Both comparison halves expose capture surface without horizon UV');
 check(surfaceNormalForHit(left.firstHit,1,spin)!==null&&surfaceNormalForHit(rightRay.firstHit,1,spin)!==null,'Both comparison halves produce finite normals');
 check(!state.horizonUV,'Inspection does not enable artificial horizon texture');
 const hidden=inspectPixelRay(state,basis,{x:250,y:300,width:1000,height:600});
 check(hidden.firstHit===null,'Existing inspector behavior preserved unless horizon hits requested');
}
state.spin=0;state.disk=true;
const hits=[];
for(const x of [250,750])for(let y=120;y<570;y+=20){const ray=inspectPixelRay(state,basis,{x,y,width:1000,height:600,includeHorizon:true});if(ray.firstHit?.kind==='disk')hits.push(ray);}
check(hits.some(h=>h.lensing)&&hits.some(h=>!h.lensing),'Disk normal candidates exist in both comparison halves');
for(const ray of hits){const n=surfaceNormalForHit(ray.firstHit);check(n[1]===(ray.firstHit.face==='TOP'?1:-1),'Normals follow actual first-hit disk side');}
state.disk=false;state.cubes=[{id:1,position:[0,50/17,10],size:2}];
const blocked=inspectPixelRay(state,basis,{x:750,y:300,width:1000,height:600,includeHorizon:true});
check(blocked.firstHit?.kind==='cube'&&surfaceNormalForHit(blocked.firstHit)===null,'Foreground cubes occlude the horizon normal');
console.log(`${checks} surface-normal checks passed: disk faces, Kerr gradients, camera projection, compare halves, and occlusion.`);
