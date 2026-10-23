import assert from 'node:assert/strict';
import {embeddingHeight,tidalState,curvatureGeometry,tidalGeometry} from '../public/black-hole-simulation-static/physics.js';

let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const near=(a,b,tol=1e-6)=>Math.abs(a-b)<tol;

// Compare the induced Euclidean metric of the embedding with the analytic
// Schwarzschild spatial metric, independently using numerical derivatives.
for(const mass of [.3,1,2.5])for(const radius of [2.01,2.2,3,6,12,20]){
 const r=radius*mass,h=1e-5*mass;
 const slope=(embeddingHeight(r+h,mass)-embeddingHeight(r-h,mass))/(2*h);
 const induced=1+slope*slope,expected=1/(1-2*mass/r);
 check(Math.abs(induced/expected-1)<1e-6,`Embedding metric at ${radius}M, mass ${mass}`);
 check(embeddingHeight(r,mass,20*mass,0)===0,'Zero vertical scale is flat');
 check(near(embeddingHeight(r,mass),mass*embeddingHeight(radius)),'Embedding scales with mass');
}
check(Number.isNaN(embeddingHeight(1.9)),'No Schwarzschild exterior embedding inside the horizon');
check(Number.isFinite(embeddingHeight(2)),'Finite throat height at the horizon');
check(embeddingHeight(20)===0,'Outer rim defines height zero');

const initial=tidalState(0),final=tidalState(1);
check(near(initial.radius,20)&&near(initial.radial,1)&&near(initial.transverse,1),'Unit initial shape at 20M');
check(near(final.radius,2.2)&&final.radial>2&&final.transverse<.6,'Exterior endpoint stretches and compresses');
check(tidalState(-1).progress===0&&tidalState(3).progress===1,'Scrubbing clamps to exterior fall interval');
let previous=initial;
for(let i=1;i<=100;i++){
 const t=tidalState(i/100);
 check(t.radius<previous.radius&&t.radial>previous.radial&&t.transverse<previous.transverse,'Infall monotonically stretches radially and compresses transversely');
 previous=t;
}
// Uniform progress is proportional to the centre's proper time. Verify the
// solutions against both independent tidal eigenvalues via finite differences.
const duration=(20**1.5-2.2**1.5)/(1.5*Math.sqrt(2)),h=.001;
for(const p of [.05,.3,.6,.85,.97]){
 const a=tidalState(p-h/duration),b=tidalState(p),c=tidalState(p+h/duration);
 for(const [key,eigenvalue] of [['radial',2],['transverse',-1]]){
  const acceleration=(c[key]-2*b[key]+a[key])/(h*h),expected=eigenvalue*b[key]/b.radius**3;
  check(Math.abs(acceleration/expected-1)<.001,`Jacobi equation ${key} at progress ${p}`);
 }
 const velocity=(c.radius-a.radius)/(2*h);
 check(near(velocity,-Math.sqrt(2/b.radius),1e-6),'Central E=1 radial free-fall velocity');
}
for(const key of ['radial','transverse'])check(Math.abs((tidalState(h/duration)[key]-initial[key])/h)<1e-6,'Initially zero relative particle velocity');

for(const mass of [.3,1,2.5])for(const scale of [0,1,3])for(const density of [16,28,44]){
 const mesh=curvatureGeometry({mass,curvatureScale:scale,curvatureDensity:density,curvatureFlat:true});
 check(mesh.lines.every(Number.isFinite)&&mesh.lines.length%14===0,'Finite complete curvature line segments across parameter limits');
}
for(const mass of [.3,1,2.5])for(const progress of [0,.5,1])for(const size of [.4,1,2]){
 const mesh=tidalGeometry({mass,tidalProgress:progress,tidalSize:size});
 check(mesh.lines.every(Number.isFinite)&&mesh.points.every(Number.isFinite),'Finite tidal geometry at parameter limits');
 check(mesh.points.length/7===226,'225 grid particles plus centre marker');
 check(near(mesh.radial,tidalState(progress).radial),'Display size and mass do not alter physical strain');
}
console.log(`${checks} physics checks passed: embedding metric, mass scaling, radial geodesic deviation, exterior limits, and finite meshes.`);
