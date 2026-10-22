import {traceKerrRay,horizonRadius} from './kerr.js?v=6';
import {iscoRadius,photonRadius} from './orbits.js?v=6';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),len=a=>Math.hypot(...a),norm=a=>mul(a,1/(len(a)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// Coordinate-space null geodesic, integrated independently of display projection.
// Starting velocity is constructed from the static observer's orthonormal frame.
export function traceRay(camera,direction,mass,charge,{lensing=true,step=.035,maxSteps=2200,spin=0}={}){
 if(charge===0&&spin>0)return traceKerrRay(camera,direction,mass,spin,{lensing,step:step*.7,maxSteps:maxSteps*2});
 let p=[...camera];const radial=norm(p),r0=len(p),f=1-2*mass/r0+charge*charge*mass*mass/(r0*r0);
 let v=lensing?add(direction,mul(radial,dot(direction,radial)*(Math.sqrt(Math.max(f,.0001))-1))):[...direction];
 const angular=cross(p,v),L2=dot(angular,angular),Q2=charge*charge*mass*mass,points=[[...p]],cutoff=(charge===0?2.0001:.035)*mass;
 const acceleration=x=>{const r=Math.max(len(x),.00001*mass);return lensing?mul(x,(-3*mass+2*Q2/r)*L2/Math.pow(r,5)):[0,0,0];};
 let status='budget',maxError=0,minRadius=r0,iterations=0;const initialEnergy=dot(p,v)**2/(r0*r0)+f*L2/(r0*r0);
 for(let i=0;i<maxSteps;i++){
  const r=len(p);minRadius=Math.min(minRadius,r);iterations=i+1;if(r<cutoff){status=charge===0?'horizon':'core';break;}
  if(r>Math.max(55,r0+35)&&dot(p,v)>0){status='escaped';break;}
  const a=acceleration(p),h=Math.min(Math.max(r*step,.00003*mass)/Math.max(len(v),1),Math.sqrt(.015*r/(len(a)+1e-20)),1.4);
  const next=add(add(p,mul(v,h)),mul(a,.5*h*h));const nv=add(v,mul(add(a,acceleration(next)),h*.5));
  if(!next.every(Number.isFinite)||!nv.every(Number.isFinite)){status='cutoff';break;}
  p=next;v=nv;if(i%2===0)points.push([...p]);
  if(lensing){const nr=len(p),energy=Math.pow(dot(p,v)/nr,2)+(1-2*mass/nr+Q2/(nr*nr))*L2/(nr*nr);maxError=Math.max(maxError,Math.abs(energy-initialEnergy)/(initialEnergy||1));}
 }
 if(len(sub(p,points.at(-1)))>1e-10)points.push([...p]);return {points,status,maxError,minRadius,iterations};
}

export class GeometryRenderer{
 constructor(gl){
  this.gl=gl;this.key='';this.traceKey='';this.paths=[];
  const vs=`#version 300 es\nprecision highp float;in vec3 position;in vec4 color;out vec4 lineColor;uniform vec3 eye,right,up,forward;uniform float tanFov,aspect,pointSize;void main(){vec3 p=position-eye;float z=dot(p,forward);gl_Position=vec4(dot(p,right)/(tanFov*aspect),dot(p,up)/tanFov,1.0002*z-.10001,z);gl_PointSize=pointSize;lineColor=color;}`;
  const fs=`#version 300 es\nprecision highp float;in vec4 lineColor;uniform bool pointMode;out vec4 fragColor;void main(){if(pointMode&&length(gl_PointCoord-vec2(.5))>.5)discard;fragColor=lineColor;}`;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
  this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  const p=gl.getAttribLocation(this.program,'position'),c=gl.getAttribLocation(this.program,'color');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(c);gl.vertexAttribPointer(c,4,gl.FLOAT,false,28,12);
  this.uniforms={};for(const n of ['eye','right','up','forward','tanFov','aspect','pointMode','pointSize'])this.uniforms[n]=gl.getUniformLocation(this.program,n);
  this.pointVao=gl.createVertexArray();gl.bindVertexArray(this.pointVao);this.pointBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(c);gl.vertexAttribPointer(c,4,gl.FLOAT,false,28,12);
 }
 renderCustom({lines,points,pointSize=5},view){
  const gl=this.gl;
  // This shares the line buffer with the ray view; invalidate its cached mesh.
  this.key='';
  gl.clearColor(.025,.034,.032,1);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(this.program);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform3fv(this.uniforms.eye,view.camera);for(const n of ['right','up','forward'])gl.uniform3fv(this.uniforms[n],view[n]);
  gl.uniform1f(this.uniforms.tanFov,Math.tan(52*Math.PI/360));gl.uniform1f(this.uniforms.aspect,gl.canvas.clientWidth/gl.canvas.clientHeight);
  gl.uniform1f(this.uniforms.pointSize,Math.max(4,pointSize*gl.canvas.width/gl.canvas.clientWidth));
  gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(lines),gl.DYNAMIC_DRAW);
  gl.uniform1i(this.uniforms.pointMode,0);gl.drawArrays(gl.LINES,0,lines.length/7);
  if(points.length){gl.bindVertexArray(this.pointVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.DYNAMIC_DRAW);gl.uniform1i(this.uniforms.pointMode,1);gl.drawArrays(gl.POINTS,0,points.length/7);}
  gl.disable(gl.BLEND);
 }

 build(state,b,debug,aspect){
  const signature=JSON.stringify([state.mass,state.charge,state.spin,state.blackhole,state.lensing,state.disk,state.diskRadius,state.fov,state.cubes,b,debug,aspect]);if(signature===this.key)return;this.key=signature;
  const vertices=[],line=(a,c,color)=>{vertices.push(...a,...color,...c,...color);};
  const sphere=(radius,color)=>{
   if(radius<=0)return;
   for(let plane=0;plane<3;plane++)for(let i=0;i<96;i++){
    const point=t=>{const a=t/96*Math.PI*2,p=[Math.cos(a)*radius,Math.sin(a)*radius,0];return plane===0?p:plane===1?[p[0],0,p[1]]:[0,p[0],p[1]];};line(point(i),point(i+1),color);
   }
   for(const lat of [-.6,.6])for(let i=0;i<64;i++){const point=t=>{const a=t/64*Math.PI*2;return [Math.cos(a)*radius*.8,lat*radius,Math.sin(a)*radius*.8];};line(point(i),point(i+1),color);}
  };
  if(debug.grid){const extent=28;for(let i=-extent;i<=extent;i+=2){line([-extent,-.025,i],[extent,-.025,i],[.35,.44,.34,i===0?.3:.10]);line([i,-.025,-extent],[i,-.025,extent],[.35,.44,.34,i===0?.3:.10]);}line([0,0,0],[8,0,0],[.85,.38,.29,.7]);line([0,0,0],[0,8,0],[.55,.76,.43,.7]);line([0,0,0],[0,0,8],[.35,.57,.85,.7]);}
  if(debug.center){const d=.7*state.mass;for(const axis of [[d,0,0],[0,d,0],[0,0,d]])line(mul(axis,-1),axis,[1.,.9,.72,.95]);sphere(.17*state.mass,[1.,.84,.55,.8]);}
  if(debug.rs){
   if(state.blackhole&&state.spin>0){const r=horizonRadius(state.spin)*state.mass,rho=Math.sqrt(r*r+(state.spin*state.mass)**2);for(let row=0;row<9;row++)for(let i=0;i<96;i++){const point=t=>{const theta=row*Math.PI/8,phi=t*Math.PI/48;return [rho*Math.sin(theta)*Math.cos(phi),r*Math.cos(theta),rho*Math.sin(theta)*Math.sin(phi)];};line(point(i),point(i+1),[.93,.44,.30,.55]);}for(let j=0;j<16;j++)for(let i=0;i<64;i++){const point=t=>[rho*Math.sin(t*Math.PI/64)*Math.cos(j*Math.PI/8),r*Math.cos(t*Math.PI/64),rho*Math.sin(t*Math.PI/64)*Math.sin(j*Math.PI/8)];line(point(i),point(i+1),[.93,.44,.30,.55]);}}
   else sphere(2*state.mass,[.93,.44,.30,.55]);
  }
  if(debug.photon&&state.blackhole&&state.spin>0){for(const direction of [-1,1]){const r=photonRadius(state.spin,direction),rho=Math.sqrt(r*r+state.spin*state.spin)*state.mass;for(let i=0;i<128;i++){const point=t=>[rho*Math.cos(t*Math.PI/64),0,rho*Math.sin(t*Math.PI/64)];line(point(i),point(i+1),[.47,.75,.88,.6]);}}}
  else if(debug.photon){const q=state.blackhole?0:state.charge,disc=9-8*q*q;if(disc>=0){sphere((3+Math.sqrt(disc))*.5*state.mass,[.47,.75,.88,.5]);if(q>0)sphere((3-Math.sqrt(disc))*.5*state.mass,[.47,.75,.88,.25]);}}
  if(state.disk)for(const r of [state.blackhole?iscoRadius(state.spin||0):2.15,state.diskRadius])for(let i=0;i<100;i++){const rho=Math.sqrt(r*r+(state.blackhole?(state.spin||0)**2:0))*state.mass,p=t=>[Math.cos(t/100*Math.PI*2)*rho,0,Math.sin(t/100*Math.PI*2)*rho];line(p(i),p(i+1),[.8,.55,.28,.35]);}
  if(debug.frustum){const tan=Math.tan(state.fov*Math.PI/360),planes=[.6,Math.min(9,len(b.camera)*.7)].map(distance=>{const center=add(b.camera,mul(b.forward,distance));return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(center,add(mul(b.right,x*tan*distance*aspect),mul(b.up,y*tan*distance))));});for(let i=0;i<4;i++){line(planes[0][i],planes[0][(i+1)%4],[.8,.85,.65,.9]);line(planes[1][i],planes[1][(i+1)%4],[.8,.85,.65,.2]);line(b.camera,planes[1][i],[.8,.85,.65,.25]);}const r=.2;for(const a of [b.right,b.up,b.forward])line(add(b.camera,mul(a,-r)),add(b.camera,mul(a,r)),[.95,.95,.75,1]);}
  for(const cube of state.cubes){const rgb=cube.color.match(/\w\w/g).map(v=>parseInt(v,16)/255),corners=Array.from({length:8},(_,i)=>add(cube.position,[(i&1?1:-1)*cube.size/2,(i&2?1:-1)*cube.size/2,(i&4?1:-1)*cube.size/2]));for(let i=0;i<8;i++)for(let bit=1;bit<=4;bit*=2)if(!(i&bit))line(corners[i],corners[i|bit],[...rgb,.8]);}
  if(debug.rays){
   const traceKey=JSON.stringify([b,state.mass,state.charge,state.spin,state.blackhole,state.lensing,state.fov,debug.density,aspect]);
   if(traceKey!==this.traceKey){this.traceKey=traceKey;this.paths=[];const n=debug.density,tan=Math.tan(state.fov*Math.PI/360);
    // A central bundle samples the observer's image plane; the frustum still
    // outlines the complete image. Rays are traced backwards from the eye.
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const sx=(x/(n-1)*2-1)*.48,sy=(y/(n-1)*2-1)*.34;const direction=norm(add(b.forward,add(mul(b.right,sx*tan*aspect),mul(b.up,sy*tan))));const ray=traceRay(b.camera,direction,state.mass,state.blackhole?0:state.charge,{lensing:state.lensing,spin:state.blackhole?state.spin:0});this.paths.push({...ray,central:x===(n-1)/2&&y===(n-1)/2});}
   }
   for(const path of this.paths)for(let i=0;i<path.points.length-1;i++){const radius=len(path.points[i])/state.mass,heat=Math.exp(-radius*.13);const color=path.central?[1.,.9,.55,.95]:[.30+.65*heat,.78-.25*heat,.82-.62*heat,.30+.5*heat];line(path.points[i],path.points[i+1],color);}
  }
  this.count=vertices.length/7;const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
 }
 render(state,observer,debug,view,{clear=false,aspect=this.gl.canvas.clientWidth/this.gl.canvas.clientHeight}={}){
  const gl=this.gl;this.build(state,observer,debug,aspect);
  if(clear){gl.clearColor(.025,.034,.032,1);gl.clear(gl.COLOR_BUFFER_BIT);}
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform3fv(this.uniforms.eye,view.camera);for(const n of ['right','up','forward'])gl.uniform3fv(this.uniforms[n],view[n]);gl.uniform1f(this.uniforms.tanFov,Math.tan((clear?52:state.fov)*Math.PI/360));gl.uniform1f(this.uniforms.aspect,aspect);gl.uniform1f(this.uniforms.pointSize,4);gl.uniform1i(this.uniforms.pointMode,0);gl.drawArrays(gl.LINES,0,this.count);
  if(debug.rays&&this.paths.length){const points=[];this.paths.forEach((path,i)=>{const index=Math.floor(((state.time*.16+i*.071)%1)*(path.points.length-1));points.push(...path.points[index],1.,.93,.72,.95);});gl.bindVertexArray(this.pointVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.DYNAMIC_DRAW);gl.uniform1i(this.uniforms.pointMode,1);gl.drawArrays(gl.POINTS,0,points.length/7);}
  gl.disable(gl.BLEND);
 }
}
