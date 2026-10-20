// Kerr–Schild Cartesian coordinates, spin axis +Y, G=c=1.
// Use the outgoing chart for past-directed camera rays: this is regular at
// the horizon encountered while tracing light backwards from the observer.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s);
export const horizonRadius=(spin=0)=>1+Math.sqrt(1-spin*spin);
export function kerrRadius(p,a=0){const s=dot(p,p)-a*a;return Math.sqrt(Math.max(1e-20,(s+Math.sqrt(s*s+4*a*a*p[1]*p[1]))/2));}
export function kerrMetric(p,mass=1,spin=0){
 const a=-spin*mass,r=kerrRadius(p,a),r2=r*r,D=r2+a*a,F=r2*r2+a*a*p[1]*p[1],sigma=F/r2;
 const H=mass*r*r2/F,l=[(r*p[0]-a*p[2])/D,p[1]/r,(r*p[2]+a*p[0])/D];
 const dr=[r*p[0]/sigma,p[1]*D/(r*sigma),r*p[2]/sigma];
 const gradH=dr.map((v,i)=>H*((3/r-4*r*r2/F)*v-(i===1?2*a*a*p[1]/F:0)));
 return {a,r,H,l,dr,gradH};
}
export function kerrInitialMomentum(position,direction,mass=1,spin=0){
 const {H,l}=kerrMetric(position,mass,spin),f=1-2*H;
 if(f<=0)throw new Error('Static camera must remain outside the Kerr ergosphere.');
 const d=dot(l,direction),root=Math.sqrt(f);
 return add(mul(direction,1/root),mul(l,(d+2*H)/f-d/root));
}
export function kerrHamiltonian(position,p,mass=1,spin=0){const {H,l}=kerrMetric(position,mass,spin);return .5*(-1+dot(p,p))-H*(1+dot(l,p))**2;}
export function kerrDerivative(position,p,mass=1,spin=0){
 const {a,r,H,l,dr,gradH}=kerrMetric(position,mass,spin),D=r*r+a*a;
 const B=position[0]*p[0]+position[2]*p[2],N=r*B+a*(position[0]*p[2]-position[2]*p[0]);
 const factor=B/D-2*r*N/(D*D)-p[1]*position[1]/(r*r);
 const explicit=[(r*p[0]+a*p[2])/D,p[1]/r,(r*p[2]-a*p[0])/D];
 const gradQ=dr.map((v,i)=>v*factor+explicit[i]),S=1+dot(l,p);
 return {x:add(p,mul(l,-2*H*S)),p:gradH.map((v,i)=>v*S*S+2*H*S*gradQ[i])};
}
export function kerrStep(x,p,h,mass=1,spin=0){
 const a=kerrDerivative(x,p,mass,spin),b=kerrDerivative(add(x,mul(a.x,h/2)),add(p,mul(a.p,h/2)),mass,spin),c=kerrDerivative(add(x,mul(b.x,h/2)),add(p,mul(b.p,h/2)),mass,spin),d=kerrDerivative(add(x,mul(c.x,h)),add(p,mul(c.p,h)),mass,spin);
 return {x:x.map((v,i)=>v+h*(a.x[i]+2*b.x[i]+2*c.x[i]+d.x[i])/6),p:p.map((v,i)=>v+h*(a.p[i]+2*b.p[i]+2*c.p[i]+d.p[i])/6)};
}
export function traceKerrRay(camera,direction,mass,spin,{lensing=true,step=.025,maxSteps=5000}={}){
 let x=[...camera],p=lensing?kerrInitialMomentum(x,direction,mass,spin):[...direction];
 const points=[[...x]],r0=kerrRadius(x,spin*mass),cutoff=horizonRadius(spin)*mass*1.0005;
 let status='budget',maxError=0,minRadius=r0,iterations=0;
 for(let i=0;i<maxSteps;i++){
  const r=kerrRadius(x,spin*mass);minRadius=Math.min(minRadius,r);iterations=i+1;
  if(r<cutoff){status='horizon';break;}
  const v=lensing?kerrDerivative(x,p,mass,spin).x:direction;
  if(Math.hypot(...x)>Math.max(70*mass,r0+40*mass)&&dot(x,v)>0){status='escaped';break;}
  const h=Math.min(r*step/Math.max(Math.hypot(...v),.1),1*mass);
  const next=lensing?kerrStep(x,p,h,mass,spin):{x:add(x,mul(direction,h)),p};
  if(!next.x.every(Number.isFinite)||!next.p.every(Number.isFinite)){status='cutoff';break;}
  x=next.x;p=next.p;if(i%2===0)points.push([...x]);
  if(lensing)maxError=Math.max(maxError,Math.abs(2*kerrHamiltonian(x,p,mass,spin)));
 }
 points.push([...x]);return {points,status,maxError,minRadius,iterations};
}

// The same analytic Hamiltonian derivatives as above, used by the GPU tracer.
export const kerrGLSL=`
float kerrR(vec3 x,float a){float s=dot(x,x)-a*a;return sqrt(max(1e-12,.5*(s+sqrt(s*s+4.*a*a*x.y*x.y))));}
void kerrField(vec3 x,float a,out float r,out float H,out vec3 l,out vec3 dr,out vec3 gradH){
 r=kerrR(x,a);float r2=r*r,D=r2+a*a,F=r2*r2+a*a*x.y*x.y,sigma=F/r2;
 H=mass*r*r2/F;l=vec3((r*x.x-a*x.z)/D,x.y/r,(r*x.z+a*x.x)/D);
 dr=vec3(r*x.x/sigma,x.y*D/(r*sigma),r*x.z/sigma);
 gradH=H*((3./r-4.*r*r2/F)*dr-vec3(0.,2.*a*a*x.y/F,0.));
}
vec3 kerrInit(vec3 x,vec3 d,float a){float r,H;vec3 l,dr,g;kerrField(x,a,r,H,l,dr,g);float f=max(1.-2.*H,.0001),q=dot(l,d);return d/sqrt(f)+l*((q+2.*H)/f-q/sqrt(f));}
void kerrFlow(vec3 x,vec3 p,float a,out vec3 dx,out vec3 dp){
 float r,H;vec3 l,dr,g;kerrField(x,a,r,H,l,dr,g);float D=r*r+a*a,B=x.x*p.x+x.z*p.z,N=r*B+a*(x.x*p.z-x.z*p.x);
 vec3 gradQ=dr*(B/D-2.*r*N/(D*D)-p.y*x.y/(r*r))+vec3((r*p.x+a*p.z)/D,p.y/r,(r*p.z-a*p.x)/D);
 float S=1.+dot(l,p);dx=p-2.*H*S*l;dp=g*S*S+2.*H*S*gradQ;
}
`;
