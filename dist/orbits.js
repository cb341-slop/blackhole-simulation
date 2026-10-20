import {horizonRadius} from './kerr.js?v=6';
// Equatorial Kerr timelike geodesics. r,a,L in M; proper time in M.
export function photonRadius(a=0,direction=1){return 2*(1+Math.cos(2/3*Math.acos(-direction*a)));}
export function iscoRadius(a=0,direction=1){
 const z1=1+Math.cbrt(1-a*a)*(Math.cbrt(1+a)+Math.cbrt(1-a)),z2=Math.sqrt(3*a*a+z1*z1);
 return 3+z2-direction*Math.sqrt(Math.max(0,(3-z1)*(3+z1+2*z2)));
}
export function circularOrbit(r,a=0,direction=1){
 const horizon=horizonRadius(a),photon=photonRadius(a,direction),isco=iscoRadius(a,direction),tolerance=1e-7;
 let classification=r<=horizon+tolerance?'Horizon / interior':r<photon-tolerance?'No massive circular orbit':Math.abs(r-photon)<=tolerance?'Photon orbit only · unstable':r<isco-tolerance?'Unstable circular orbit':Math.abs(r-isco)<=tolerance?'Marginally stable · ISCO':'Stable circular orbit';
 const valid=r>photon+tolerance&&r>horizon;
 if(!valid)return {valid,classification,horizon,photon,isco};
 const root=Math.sqrt(r),den=r**.75*Math.sqrt(r**1.5-3*root+2*direction*a);
 return {valid,classification,horizon,photon,isco,energy:(r**1.5-2*root+direction*a)/den,L:direction*(r*r-2*direction*a*root+a*a)/den,omega:direction/(r**1.5+direction*a)};
}
export function radialPotential(r,E,L,a=0){return E*E-1+2/r-(L*L+a*a*(1-E*E))/(r*r)+2*(L-a*E)**2/(r*r*r);}
export function orbitEnergy(r,L,a=0,velocity=0){
 const A=1+a*a/(r*r)+2*a*a/(r*r*r),B=-4*a*L/(r*r*r),C=-1+2/r-(L*L+a*a)/(r*r)+2*L*L/(r*r*r)-velocity*velocity;
 return (-B+Math.sqrt(Math.max(0,B*B-4*A*C)))/(2*A);
}
export function orbitDerivative([r,v,phi],E,L,a){
 const delta=r*r-2*r+a*a;
 return [v,-1/(r*r)+(L*L+a*a*(1-E*E))/(r**3)-3*(L-a*E)**2/(r**4),((1-2/r)*L+2*a*E/r)/delta];
}
export function orbitStep(y,h,E,L,a=0){
 const next=(v,k,s)=>v.map((x,i)=>x+s*k[i]);
 const k1=orbitDerivative(y,E,L,a),k2=orbitDerivative(next(y,k1,h/2),E,L,a),k3=orbitDerivative(next(y,k2,h/2),E,L,a),k4=orbitDerivative(next(y,k3,h),E,L,a);
 return y.map((x,i)=>x+h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
}
export function createOrbit(radius=8,spin=0,direction=1,momentum=1,kick=0){
 const circular=circularOrbit(radius,spin,direction);
 if(!circular.valid)return {circular,spin,direction,radius,y:[radius,0,0],tau:0,trail:[],status:circular.classification,maxError:0};
 const L=circular.L*momentum,E=orbitEnergy(radius,L,spin,kick);
 return {circular,spin,direction,radius,y:[radius,kick,0],tau:0,L,E,trail:[[radius,0]],status:'running',maxError:0};
}
export function advanceOrbit(orbit,duration){
 if(orbit.status!=='running')return;
 let remaining=duration;
 for(let i=0;i<1200&&remaining>1e-10;i++){
  const r=orbit.y[0],cutoff=horizonRadius(orbit.spin)+.015;
  if(r<=cutoff){orbit.status='Horizon reached · exterior integration ends';break;}
  if(r>100){orbit.status='Escaped the displayed region';break;}
  const angular=Math.abs(orbitDerivative(orbit.y,orbit.E,orbit.L,orbit.spin)[2]);
  const h=Math.min(remaining,.08,.025/Math.max(angular,.01),.15*(r-cutoff)/Math.max(Math.abs(orbit.y[1]),.01));
  if(h<1e-6){orbit.status='Horizon reached · exterior integration ends';break;}
  const y=orbitStep(orbit.y,h,orbit.E,orbit.L,orbit.spin);
  if(!y.every(Number.isFinite)){orbit.status='Numerical limit reached';break;}
  orbit.y=y;orbit.tau+=h;remaining-=h;
  orbit.maxError=Math.max(orbit.maxError,Math.abs(y[1]*y[1]-radialPotential(y[0],orbit.E,orbit.L,orbit.spin)));
  const last=orbit.trail.at(-1);
  if(Math.abs(y[2]-last[1])>.018||Math.abs(y[0]-last[0])>.035){orbit.trail.push([y[0],y[2]]);if(orbit.trail.length>5000)orbit.trail.shift();}
 }
}
export function orbitGeometry(orbit,{mass=1,orbitTrail=true,orbitReference=true}={}){
 const lines=[],points=[],a=orbit.spin,rh=horizonRadius(a),line=(p,q,c)=>lines.push(...p.map(x=>x*mass),...c,...q.map(x=>x*mass),...c);
 const position=(r,phi)=>{const rho=Math.sqrt(r*r+a*a);return [rho*Math.cos(phi),0,-rho*Math.sin(phi)];};
 const ring=(r,color)=>{for(let i=0;i<160;i++)line(position(r,i*Math.PI/80),position(r,(i+1)*Math.PI/80),color);};
 // Oblate coordinate horizon, not an embedding of its intrinsic surface metric.
 const surface=(theta,phi)=>[Math.sqrt(rh*rh+a*a)*Math.sin(theta)*Math.cos(phi),rh*Math.cos(theta),Math.sqrt(rh*rh+a*a)*Math.sin(theta)*Math.sin(phi)];
 for(let row=1;row<12;row++)for(let i=0;i<96;i++)line(surface(row*Math.PI/12,i*Math.PI/48),surface(row*Math.PI/12,(i+1)*Math.PI/48),[.96,.50,.30,.32]);
 for(let col=0;col<16;col++)for(let i=0;i<48;i++)line(surface(i*Math.PI/48,col*Math.PI/8),surface((i+1)*Math.PI/48,col*Math.PI/8),[.96,.50,.30,.32]);
 if(orbitReference){ring(orbit.circular.photon,[.66,.75,1,.45]);ring(orbit.circular.isco,[.44,.83,.59,.65]);ring(orbit.radius,[.9,.87,.69,.32]);}
 if(orbitTrail)for(let i=1;i<orbit.trail.length;i++)line(position(...orbit.trail[i-1]),position(...orbit.trail[i]),[.96,.80,.41,.35+.55*i/orbit.trail.length]);
 const p=position(orbit.y[0],orbit.y[2]);points.push(...p.map(x=>x*mass),1,.88,.54,1);
 line([0,-3,0],[0,4,0],[.6,.8,.9,.4]);
 // Sparse plane reference around the orbit.
 const extent=Math.max(12,orbit.radius*1.35);
 for(let i=-extent;i<=extent;i+=2){line([-extent,-.04,i],[extent,-.04,i],[.36,.47,.42,.08]);line([i,-.04,-extent],[i,-.04,extent],[.36,.47,.42,.08]);}
 return {lines,points,pointSize:9};
}
