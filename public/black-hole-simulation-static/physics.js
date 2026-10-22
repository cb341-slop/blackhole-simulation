// Schwarzschild educational diagrams. Lengths use GM/c², with G = c = 1.
// The embedding is a constant-Schwarzschild-time equatorial spatial slice.
export function embeddingHeight(r,mass=1,outer=20*mass,scale=1){
 const rs=2*mass;
 return r<rs?NaN:scale*2*Math.sqrt(rs)*(Math.sqrt(r-rs)-Math.sqrt(outer-rs));
}

// Exact linear Jacobi-field solution along radial E=1 free fall (from rest at
// infinity), initialized at r0 with unit separation and zero relative velocity.
// d²ξr/dτ² = 2M ξr/r³; d²ξ⊥/dτ² = −M ξ⊥/r³.
export function tidalState(progress,start=20,end=2.2){
 const p=Math.max(0,Math.min(1,progress));
 const radius=(start**1.5+p*(end**1.5-start**1.5))**(2/3),x=radius/start;
 return {progress:p,radius,radial:.2*x*x+.8/Math.sqrt(x),transverse:2*Math.sqrt(x)-x};
}

function drawing(){
 const lines=[],points=[];
 const line=(a,b,color)=>lines.push(...a,...color,...b,...color);
 const ring=(r,y,color,n=128)=>{for(let i=0;i<n;i++){const a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n;line([r*Math.cos(a),y,r*Math.sin(a)],[r*Math.cos(b),y,r*Math.sin(b)],color);}};
 const sphere=(r,color)=>{for(let plane=0;plane<3;plane++)for(let i=0;i<96;i++){const p=t=>{const a=t*Math.PI/48,c=Math.cos(a)*r,s=Math.sin(a)*r;return plane===0?[c,s,0]:plane===1?[c,0,s]:[0,c,s];};line(p(i),p(i+1),color);}};
 return {lines,points,line,ring,sphere};
}

export function curvatureGeometry({mass=1,curvatureScale=1,curvatureDensity=28,curvatureFlat=false}={}){
 const d=drawing(),rs=2*mass,outer=20*mass,n=curvatureDensity;
 const height=r=>embeddingHeight(r,mass,outer,curvatureScale);
 // Quadratic radial spacing resolves the vertical tangent at the throat.
 for(let i=0;i<=n;i++){
  const r=rs+(outer-rs)*(i/n)**2,t=i/n;
  d.ring(r,height(r),[.28+.18*t,.68+.14*t,.74+.08*t,.30+.25*t]);
 }
 for(let a=0;a<n;a++){
  const phi=a*2*Math.PI/n;
  for(let i=0;i<96;i++){
   const p=j=>{const r=rs+(outer-rs)*(j/96)**2;return [r*Math.cos(phi),height(r),r*Math.sin(phi)];};
   d.line(p(i),p(i+1),[.38,.77,.79,.46]);
  }
 }
 if(curvatureFlat){
  for(let r=2;r<=20;r+=2)d.ring(r*mass,0,[.74,.77,.69,.14],96);
  for(let a=0;a<16;a++){const phi=a*Math.PI/8;d.line([rs*Math.cos(phi),0,rs*Math.sin(phi)],[outer*Math.cos(phi),0,outer*Math.sin(phi)],[.74,.77,.69,.14]);}
  d.line([rs,0,0],[rs,height(rs),0],[.92,.61,.36,.5]);
 }
 d.ring(rs,height(rs),[1,.49,.29,1]);
 d.ring(3*mass,height(3*mass),[.77,.85,1,.9]);
 // Radial coordinate axes remain in the outer reference plane.
 d.line([-22*mass,0,0],[22*mass,0,0],[.86,.46,.35,.28]);
 d.line([0,0,-22*mass],[0,0,22*mass],[.38,.58,.91,.28]);
 return d;
}

export function tidalGeometry({mass=1,tidalProgress=0,tidalSize=1,tidalArrows=true,tidalGhost=true}={}){
 const d=drawing(),s=tidalState(tidalProgress),center=s.radius*mass;
 const size=tidalSize*mass,half=[1.2*size,.65*size,.65*size],counts=[9,5,5];
 const position=(i,j,k,deformed=true)=>[center+(i/4-1)*half[0]*(deformed?s.radial:1),(j/2-1)*half[1]*(deformed?s.transverse:1),(k/2-1)*half[2]*(deformed?s.transverse:1)];
 d.sphere(2*mass,[.96,.45,.29,.62]);
 d.ring(3*mass,0,[.63,.75,.92,.25]);
 // Radial centre trajectory, ending outside the event horizon.
 for(let x=2.2;x<20;x+=.4)d.line([x*mass,0,0],[Math.min(20,x+.19)*mass,0,0],[.74,.73,.64,.4]);
 for(const r of [2.2,3,6,10,15,20])d.line([r*mass,-.18*mass,0],[r*mass,.18*mass,0],[.83,.82,.7,.8]);
 for(let i=0;i<counts[0];i++)for(let j=0;j<counts[1];j++)for(let k=0;k<counts[2];k++){
  const p=position(i,j,k),edge=i===0||i===8;
  d.points.push(...p,...(edge?[1,.66,.34,.95]:[.42,.83,.88,.85]));
  if(i<8)d.line(p,position(i+1,j,k),[.95,.64,.35,.22]);
  if(j<4)d.line(p,position(i,j+1,k),[.39,.79,.86,.28]);
  if(k<4)d.line(p,position(i,j,k+1),[.39,.79,.86,.28]);
 }
 if(tidalGhost){
  const corners=Array.from({length:8},(_,i)=>position(i&1?8:0,i&2?4:0,i&4?4:0,false));
  for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))d.line(corners[i],corners[i|bit],[.89,.89,.8,.34]);
 }
 const arrow=(a,b,color)=>{d.line(a,b,color);const v=b.map((x,i)=>x-a[i]),len=Math.hypot(...v),axis=Math.abs(v[0])>.1?[0,1,0]:[1,0,0];for(const sign of [-1,1])d.line(b,b.map((x,i)=>x-v[i]*.25+axis[i]*len*.13*sign),color);};
 if(tidalArrows){
  const radial=half[0]*s.radial,trans=half[1]*s.transverse;
  for(const sign of [-1,1]){
   arrow([center+sign*(radial+.2*size),0,0],[center+sign*(radial+1.2*size),0,0],[1,.64,.31,.95]);
   arrow([center,sign*(trans+1.1*size),0],[center,sign*(trans+.2*size),0],[.39,.84,.96,.95]);
   arrow([center,0,sign*(trans+1.1*size)],[center,0,sign*(trans+.2*size)],[.39,.84,.96,.8]);
  }
 }
 d.points.push(center,0,0,1,1,.9,1);
 return {...d,...s};
}
