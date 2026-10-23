import assert from 'node:assert/strict';
import {inspectPixelRay} from '../public/black-hole-simulation-static/ray-inspector.js';
import {projectNormal,projectLensedNormal,surfaceNormalForHit} from '../public/black-hole-simulation-static/surface-normals.js';

let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=a=>a.map(v=>v/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const camera=[4,5,17],forward=unit(camera.map(v=>-v)),right=unit(cross(forward,[0,1,0]));
const basis={camera,forward,right,up:cross(right,forward)},image={width:1000,height:600};
const base={mass:1,charge:1.35,spin:0,blackhole:true,compare:true,lensing:true,disk:true,diskRadius:14,cubes:[],time:0,fov:55};
const alignment=(a,b)=>(a.dx*b.dx+a.dy*b.dy)/(Math.hypot(a.dx,a.dy)*Math.hypot(b.dx,b.dy));

// In the zero-curvature limit, compare with an independent analytic derivative
// of perspective projection at an off-axis source, not a camera-axis rotation.
for(const x of [30,170,360,499.9])for(const y of [100,240,450]){
 const state={...base,mass:1e-9,disk:false},ray=inspectPixelRay(state,basis,{x,y,...image});
 const position=ray.points[8];ray.firstHit={kind:'disk',face:'TOP',position};
 const normal=unit([.3,1,-.2]),p=projectLensedNormal(normal,ray,state,basis,{x,y,...image});
 const d=sub(position,camera),z=dot(d,forward),nf=dot(normal,forward);
 const expected={dx:dot(normal,right)-dot(d,right)*nf/z,dy:-dot(normal,basis.up)+dot(d,basis.up)*nf/z};
 check(p&&alignment(p,expected)>1-1e-9,'Flat-space ray bundle agrees with analytic off-axis perspective projection');
 check(Math.abs(p.towardCamera+dot(normal,unit(d)))<1e-8,'Flat-space depth cue uses the source sightline');
}

let rotated=0,mirrored=0,tested=0;
for(const model of [{blackhole:true,spin:0},{blackhole:true,spin:.8},{blackhole:false,spin:0}]){
 const state={...base,...model};
 for(const [x,y] of [[50,130],[50,180],[70,330],[250,180],[350,200],[499.9,200]]){
  const ray=inspectPixelRay(state,basis,{x,y,...image,includeHorizon:true}),hit=ray.firstHit;
  if(hit?.kind!=='disk')continue;
  const normal=surfaceNormalForHit(hit),p=projectLensedNormal(normal,ray,state,basis,{x,y,...image});
  check(p&&Object.values(p).flat().every(Number.isFinite),'Selected primary/secondary image produces a finite apparent normal');
  const opposite=projectLensedNormal(normal.map(v=>-v),ray,state,basis,{x,y,...image});
  check(Math.hypot(p.dx+opposite.dx,p.dy+opposite.dy)<1e-10&&Math.abs(p.towardCamera+opposite.towardCamera)<1e-10,'Reversing a source normal reverses both its apparent arrow and depth cue');
  const straight=projectNormal(normal,basis,52,hit.position),cos=alignment(p,straight);
  if(cos<.95)rotated++;
  if(hit.face==='BOTTOM'&&cos<-.5)mirrored++;

  // Independently trace a tiny step in the displayed arrow direction and
  // intersect the original source screen. Its source displacement must point
  // along the selected normal's transverse component, with the correct sign.
  const magnitude=Math.hypot(p.dx,p.dy),eps=.02;
  const displaced=inspectPixelRay({...state,compare:false},basis,{x:x+eps*p.dx/magnitude,y:y+eps*p.dy/magnitude,width:500,height:600});
  const tangent=p.sourceTangent,intersections=[];
  for(let i=1;i<displaced.points.length;i++){
   const a=displaced.points[i-1],d=sub(displaced.points[i],a),denom=dot(d,tangent);if(Math.abs(denom)<1e-12)continue;
   const t=dot(sub(hit.position,a),tangent)/denom;
   if(t>=0&&t<=1)intersections.push(a.map((v,j)=>v+t*d[j]));
  }
  intersections.sort((a,b)=>Math.hypot(...sub(a,hit.position))-Math.hypot(...sub(b,hit.position)));
  check(intersections.length>0,'Independent perturbed ray reaches the selected source screen');
  const displacement=sub(intersections[0],hit.position),transverse=normal.map((v,i)=>v-dot(normal,tangent)*tangent[i]);
  check(dot(unit(displacement),unit(transverse))>.97,'Apparent arrow follows a positive virtual normal displacement through the same image branch');
  tested++;
 }
}
check(tested>=10&&rotated>=8,'Exercise strongly rotated normals across Schwarzschild, Kerr, and naked-singularity models');
check(mirrored>0,'Secondary underside images reverse the apparent arrow rather than copying the straight-view direction');

// The finite-difference bundle must remain on the lensed half even when its
// neighbors cross the comparison divider; single-view and paired results agree.
const point={x:499.9,y:200,...image},ray=inspectPixelRay(base,basis,point),normal=surfaceNormalForHit(ray.firstHit);
const paired=projectLensedNormal(normal,ray,base,basis,point);
const singleRay=inspectPixelRay({...base,compare:false},basis,{...point,width:500});
const single=projectLensedNormal(normal,singleRay,{...base,compare:false},basis,{...point,width:500});
check(Math.hypot(paired.dx-single.dx,paired.dy-single.dy)<1e-10,'Comparison divider never mixes a straight neighbor into the lensed derivative');
const center=inspectPixelRay({...base,disk:false},basis,{x:250,y:300,...image,includeHorizon:true});
const radial=projectLensedNormal(surfaceNormalForHit(center.firstHit),center,base,basis,{x:250,y:300,...image});
check(radial&&Math.hypot(radial.dx,radial.dy)<1e-8&&radial.towardCamera>.99,'Radial face-on horizon normal uses a depth glyph rather than a fabricated screen arrow');
check(projectLensedNormal([0,1,0],{lensing:true,points:[]},base,basis,{x:0,y:0,...image})===null,'Missing image branch reports unavailable instead of copying the straight arrow');
// For an axisymmetric lens, the source on the optical axis behind the hole is
// an Einstein-ring caustic: rotating the observer ray around the axis reaches
// the same source, so one eigenvalue of the source map vanishes.
const axialBasis={camera:[0,0,17],forward:[0,0,-1],right:[1,0,0],up:[0,1,0]};
for(const x of [450,470,490]){
 const state={...base,compare:false,disk:false},ray=inspectPixelRay(state,axialBasis,{x,y:300,width:500,height:600});
 for(let i=2;i<ray.points.length;i++){
  const a=ray.points[i-1],b=ray.points[i];if(a[0]<=0||b[0]>0)continue;
  const t=-a[0]/(b[0]-a[0]);ray.firstHit={kind:'disk',face:'TOP',position:a.map((v,j)=>v+t*(b[j]-v))};break;
 }
 check(ray.firstHit&&projectLensedNormal([0,1,0],ray,state,axialBasis,{x,y:300,width:500,height:600})===null,'Einstein-ring caustic rejects an undefined inverse instead of inventing an arrow direction');
}
console.log(`${checks} lensed-normal checks passed: flat-space perspective, ${tested} source displacements, ${rotated} rotated arrows, ${mirrored} reversed underside images, and comparison-divider continuity.`);
