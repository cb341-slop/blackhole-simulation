import assert from 'node:assert/strict';
import {kerrRadius,kerrMetric,kerrInitialMomentum,kerrHamiltonian,kerrDerivative,kerrStep,traceKerrRay,horizonRadius} from '../public/black-hole-simulation-static/kerr.js';
import {circularOrbit,photonRadius,iscoRadius,orbitEnergy,radialPotential,orbitDerivative,createOrbit,advanceOrbit,orbitGeometry} from '../public/black-hole-simulation-static/orbits.js';
import {horizonUVAt} from '../public/black-hole-simulation-static/horizon-uv.js';
import {traceRay} from '../public/black-hole-simulation-static/geometry.js';
import {inspectPixelRay} from '../public/black-hole-simulation-static/ray-inspector.js';

let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const near=(a,b,tolerance=1e-8)=>Math.abs(a-b)<tolerance;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>a.map(v=>v/Math.hypot(...a));
// Test the metric's implicit spheroidal radius, null normalization, and analytic
// derivatives independently with finite differences at non-equatorial points.
for(const mass of [.3,1,2.5])for(const spin of [0,.5,.98])for(const x of [[5,3,8],[-8,1,4],[3,-7,-2]]){
 const position=x.map(v=>v*mass),m=kerrMetric(position,mass,spin),a=spin*mass;
 check(near((position[0]**2+position[2]**2)/(m.r*m.r+a*a)+position[1]**2/(m.r*m.r),1),'Kerr spheroidal radius identity');
 check(near(dot(m.l,m.l),1),'Kerr–Schild spatial null vector has unit norm');
 const direction=norm([-x[0],-x[1]+2,-x[2]]),p=kerrInitialMomentum(position,direction,mass,spin);
 check(Math.abs(kerrHamiltonian(position,p,mass,spin))<1e-12,'Static-observer ray is null');
 const derivative=kerrDerivative(position,p,mass,spin),h=1e-5*mass;
 for(let i=0;i<3;i++){
  const lo=[...position],hi=[...position];lo[i]-=h;hi[i]+=h;
  const finite=-(kerrHamiltonian(hi,p,mass,spin)-kerrHamiltonian(lo,p,mass,spin))/(2*h);
  check(near(derivative.p[i],finite,2e-9/mass),'Hamiltonian force matches spatial derivative');
 }
}
for(const spin of [0,.5,.98]){
 const rh=horizonRadius(spin),rho=Math.sqrt(rh*rh+spin*spin);
 check(near(kerrRadius([rho,0,0],spin),rh)&&near(kerrRadius([0,rh,0],spin),rh),'Equatorial and polar horizon points have the same Kerr radius');
 const ray=traceKerrRay([0,0,20],[0,0,-1],1,spin);
 check(ray.status==='horizon'&&ray.maxError<.0001,'Backward ray reaches horizon with small null drift');
 check(traceKerrRay([0,0,20],norm([.6,.1,-1]),1,spin).status==='escaped','Off-axis ray escapes Kerr');
 let x=[6,2,20],p=kerrInitialMomentum(x,norm([.3,0,-1]),1,spin),angular=x[2]*p[0]-x[0]*p[2],error=0;
 for(let i=0;i<500;i++){const next=kerrStep(x,p,.02,1,spin);x=next.x;p=next.p;error=Math.max(error,Math.abs((x[2]*p[0]-x[0]*p[2])-angular));}
 check(error<1e-7,'Axial angular momentum is conserved');
}
const direction=norm([.35,0,-1]),old=traceRay([0,0,20],direction,1,0),ks=traceKerrRay([0,0,20],direction,1,0);
const outgoing=ray=>norm(ray.points.at(-1).map((v,i)=>v-ray.points.at(-2)[i]));
check(dot(outgoing(old),outgoing(ks))>.9999&&old.status===ks.status,'Kerr tracing tends to existing Schwarzschild solution at zero spin');
// Use the GPU's balanced step schedule against the finer CPU reference. Check
// endpoint fate and the independent null constraint on both sides of the hole.
for(const spin of [.5,.98])for(const offset of [-.4,-.2,0,.2,.4]){
 const direction=norm([offset,.02,-1]),reference=traceKerrRay([0,0,20],direction,1,spin);
 let x=[0,0,20],p=kerrInitialMomentum(x,direction,1,spin),status='budget',error=0;
 for(let i=0;i<408;i++){
  const r=kerrRadius(x,spin),v=kerrDerivative(x,p,1,spin).x;
  if(r<horizonRadius(spin)*1.0005){status='horizon';break;}
  if(Math.hypot(...x)>90&&dot(x,v)>0){status='escaped';break;}
  const h=Math.min(2,Math.max(.002,r*.06))/Math.max(Math.hypot(...v),1),next=kerrStep(x,p,h,1,spin);x=next.x;p=next.p;
  error=Math.max(error,Math.abs(2*kerrHamiltonian(x,p,1,spin)));
 }
 check(status===reference.status,'Balanced Kerr march agrees with fine reference ray fate');
 check(error<.001,'Balanced Kerr march keeps null residual below 0.1%');
}
for(const spin of [0,.5,.98])for(const direction of [-1,1]){
 const isco=iscoRadius(spin,direction),photon=photonRadius(spin,direction);
 check(photon<isco&&photon>horizonRadius(spin),'Photon orbit and ISCO are exterior and ordered');
 check(circularOrbit(isco,spin,direction).classification.startsWith('Marginal'),'ISCO is marginal');
 check(!circularOrbit(photon,spin,direction).valid,'Photon circle cannot host massive particle');
 const unstable=circularOrbit((photon+isco)/2,spin,direction),stable=circularOrbit(isco+2,spin,direction);
 check(unstable.classification.startsWith('Unstable')&&stable.classification.startsWith('Stable'),'Stability classes bracket ISCO');
 for(const c of [unstable,stable]){
  const r=c===unstable?(photon+isco)/2:isco+2;
  check(Math.abs(radialPotential(r,c.energy,c.L,spin))<1e-12,'Circular orbit satisfies radial constraint');
  check(Math.abs(orbitDerivative([r,0,0],c.energy,c.L,spin)[1])<1e-12,'Circular orbit has zero radial acceleration');
  check(near(orbitEnergy(r,c.L,spin),c.energy),'Energy reconstruction retains analytic circular energy');
  const h=1e-4,force=q=>orbitDerivative([q,0,0],c.energy,c.L,spin)[1],slope=(force(r+h)-force(r-h))/(2*h);
  check(c===stable?slope<0:slope>0,'Restoring/repelling radial force agrees with stability label');
  const kicked=orbitEnergy(r,c.L,spin,.01);
  check(near(radialPotential(r,kicked,c.L,spin),.0001,1e-12),'Radial kick initializes on the timelike constraint');
 }
 const orbit=createOrbit(isco+3,spin,direction);
 for(let i=0;i<400;i++)advanceOrbit(orbit,.5);
 check(near(orbit.y[0],isco+3,1e-7)&&orbit.maxError<1e-10,'Unperturbed stable orbit remains circular');
 check(orbitGeometry(orbit).lines.every(Number.isFinite),'Finite orbit/horizon geometry');
}
check(circularOrbit(2).classification.startsWith('Horizon'),'1rs is horizon at zero spin');
check(circularOrbit(3).classification.startsWith('Photon'),'1.5rs is photon only');
check(circularOrbit(4).classification.startsWith('Unstable'),'2rs is unstable');
check(circularOrbit(6).classification.startsWith('Marginal'),'3rs is marginal');
check(circularOrbit(8).classification.startsWith('Stable'),'4rs is stable');
check(iscoRadius(.98,1)<iscoRadius(0)&&iscoRadius(.98,-1)>iscoRadius(0),'Spin moves prograde ISCO inward and retrograde outward');
const plunge=createOrbit(4,0,1,1,-.01),bounded=createOrbit(8,0,1,1,-.01);
for(let i=0;i<1000;i++){advanceOrbit(plunge,.5);advanceOrbit(bounded,.5);}
check(plunge.status.startsWith('Horizon'),'Inward disturbance destabilizes 2rs orbit');
check(bounded.status==='running'&&bounded.y[0]>7&&bounded.y[0]<9&&bounded.maxError<1e-8,'Same disturbance stays bounded at 4rs');
for(const spin of [0,.5,.98]){
 const r=horizonRadius(spin),rho=Math.sqrt(r*r+spin*spin);
 const north=horizonUVAt([0,r,0],1,spin),south=horizonUVAt([0,-r,0],1,spin);
 check(north.v===0&&south.v===1&&north.band===0&&south.band===3,'Horizon UV poles and hemisphere bands');
 const p=[rho,0,0],fixed=horizonUVAt(p,1,spin,12,false),initial=horizonUVAt(p,1,spin,0,true);
 check(near(fixed.u,initial.u),'Fixed labels do not rotate with time');
 const east=horizonUVAt([-rho,0,1e-9],1,spin),west=horizonUVAt([-rho,0,-1e-9],1,spin);
 check(Math.min(Math.abs(east.u-west.u),1-Math.abs(east.u-west.u))<1e-8,'Longitude wraps continuously at seam');
 const rotated=horizonUVAt(p,1,spin,12,true);
 check(spin===0?near(rotated.u,fixed.u):!near(rotated.u,fixed.u),'Horizon rotation follows black-hole spin');
 const state={mass:1,spin,blackhole:true,charge:1.03,disk:false,horizonUV:true,horizonUVRotate:false,time:0,fov:55,lensing:true,compare:false,cubes:[]};
 const basis={camera:[0,0,20],forward:[0,0,-1],right:[1,0,0],up:[0,1,0]};
 const probe=inspectPixelRay(state,basis,{x:500,y:375,width:1000,height:750});
 check(probe.firstHit?.kind==='horizon'&&/^[A-H][1-4]$/.test(probe.firstHit.label),'CPU inspector identifies horizon UV source cell');
}
console.log(`${checks} Kerr/orbit checks passed: metric, null and angular invariants, circular solutions, stability, kicks, horizon geometry, and UV coordinates.`);
