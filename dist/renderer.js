// Geometric units: G = c = 1. The spatial affine-parameter equation is
// x'' = (-3 M / r^5 + 2 Q^2 / r^6) |x × x'|^2 x.
// It follows from r'^2 = E^2 - (1 - 2M/r + Q^2/r^2) L^2/r^2.
export const vertex = `#version 300 es
in vec2 position;
out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;

export const fragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 fragColor;
uniform vec2 resolution;
uniform vec3 camera,forward,right,up;
uniform float fov,mass,charge,time,exposure,brightness,diskRadius,skyRotation;
uniform bool disk,lensing,blackhole,nasaReady;
uniform int skyMode,steps,cubeCount;
uniform vec4 cubes[8];
uniform vec3 colors[8];
uniform sampler2D skyTexture;
const float PI=3.14159265359;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.1;a*=.5;}return v;}
vec2 sphereUV(vec3 d){return vec2(atan(d.z,d.x)/(2.*PI)+.5,acos(clamp(d.y,-1.,1.))/PI);}
vec3 night(vec3 d){
 vec2 p=sphereUV(d);float band=exp(-pow((d.y*.82+d.x*.42+d.z*.2)/.19,2.));
 float cloud=fbm(p*vec2(17.,11.));float dust=fbm(p*vec2(65.,38.)+3.);
 vec3 col=vec3(.004,.007,.014)+band*(vec3(.075,.065,.068)*cloud+vec3(.025,.034,.058)*dust);
 col+=vec3(.022,.012,.008)*pow(cloud,3.)*band;
 for(int i=0;i<3;i++){
  float scale=360.+float(i)*360.;vec2 gp=p*vec2(scale,scale*.5);vec2 cell=floor(gp);vec2 pt=fract(gp)-vec2(hash(cell+13.),hash(cell+37.));
  float h=hash(cell+float(i)*7.);float star=exp(-dot(pt,pt)*(i==0?110.:230.))*step(i==0?.963:.986,h);
  vec3 tint=mix(vec3(.65,.78,1.),vec3(1.,.80,.56),hash(cell+43.));col+=tint*star*(.45+2.*h)*(.9+.1*sin(time*.15+h*35.));
 }
 return col;
}
vec3 voxel(vec3 d){
 vec2 p=sphereUV(d);vec3 col=mix(vec3(.72,.86,.92),vec3(.18,.43,.76),smoothstep(-.08,.85,d.y));
 vec3 sunDir=normalize(vec3(-.5,.55,-.7));vec2 sunUv=vec2(atan(sunDir.z,sunDir.x)/(2.*PI)+.5,acos(sunDir.y)/PI);
 vec2 sd=abs(p-sunUv);if(max(sd.x*2.,sd.y)<.022)col=vec3(1.,.97,.75);
 vec2 cloudCell=floor(p*vec2(100.,55.));float clouds=noise(floor(cloudCell/vec2(4.,2.)));if(d.y>.12&&d.y<.58&&clouds>.57)col=mix(vec3(.70,.77,.79),vec3(.96,.97,.93),smoothstep(.12,.6,d.y));
 float terrain=-.025+floor(noise(vec2(floor(p.x*120.)*.15,3.))*7.)*.016;
 if(d.y<terrain){float tile=hash(floor(p*vec2(520.,300.)));col=mix(vec3(.17,.28,.13),vec3(.32,.43,.21),tile);if(d.y<terrain-.06)col=mix(vec3(.22,.16,.10),vec3(.35,.28,.18),tile);}
 return col;
}
vec3 cubeUV(vec3 d){
 vec3 a=abs(d);vec2 st;float face;
 if(a.x>=a.y&&a.x>=a.z){if(d.x>0.){face=0.;st=vec2(-d.z,-d.y)/a.x;}else{face=1.;st=vec2(d.z,-d.y)/a.x;}}
 else if(a.y>=a.z){if(d.y>0.){face=2.;st=vec2(d.x,d.z)/a.y;}else{face=3.;st=vec2(d.x,-d.z)/a.y;}}
 else{if(d.z>0.){face=4.;st=vec2(d.x,-d.y)/a.z;}else{face=5.;st=vec2(-d.x,-d.y)/a.z;}}
 st=clamp(st*.5+.5,vec2(.001),vec2(.999));return texture(skyTexture,vec2((face+st.x)/6.,st.y)).rgb;
}
vec3 environment(vec3 d){
 float cs=cos(skyRotation),sn=sin(skyRotation);d=vec3(cs*d.x-sn*d.z,d.y,sn*d.x+cs*d.z);
 if(skyMode==0){if(nasaReady)return pow(texture(skyTexture,sphereUV(d)).rgb,vec3(2.2))*1.8;return night(d);}if(skyMode==2)return voxel(d);if(skyMode==3)return pow(texture(skyTexture,sphereUV(d)).rgb,vec3(2.2));return pow(cubeUV(d),vec3(2.2));
}
bool intersectCube(vec3 p,vec3 v,float segment,vec4 box,out vec3 normal,out vec3 hit){
 vec3 inv=1./(v+vec3(1e-10));vec3 lo=(box.xyz-box.w*.5-p)*inv,hi=(box.xyz+box.w*.5-p)*inv;
 vec3 entry=min(lo,hi),exit=max(lo,hi);float near=max(max(entry.x,entry.y),entry.z),far=min(min(exit.x,exit.y),exit.z);
 if(far<max(near,0.)||near>segment)return false;
 float t=max(near,0.);hit=p+v*t;vec3 q=(hit-box.xyz)/(box.w*.5);vec3 aq=abs(q);
 if(aq.x>aq.y&&aq.x>aq.z)normal=vec3(sign(q.x),0,0);else if(aq.y>aq.z)normal=vec3(0,sign(q.y),0);else normal=vec3(0,0,sign(q.z));return true;
}
vec3 acceleration(vec3 p,float L2,float Q2){float r=max(length(p),.025*mass);return p*((-3.*mass+2.*Q2/r)*L2/pow(r,5.));}
void main(){
 vec2 screen=(uv*2.-1.);screen.x*=resolution.x/resolution.y;
 vec3 dir=normalize(forward+(screen.x*right+screen.y*up)*tan(fov*.5));
 vec3 p=camera;float r0=length(p);vec3 radial=p/r0;float f=1.-2.*mass/r0+charge*charge*mass*mass/(r0*r0);
 vec3 v=dir+radial*dot(dir,radial)*(sqrt(max(f,.0001))-1.);
 float L2=dot(cross(p,v),cross(p,v));float Q2=charge*charge*mass*mass;
 vec3 emission=vec3(0);float transmittance=1.;vec3 finalCol=vec3(0);bool finished=false;
 for(int i=0;i<384;i++){
  if(i>=steps)break;
  float r=length(p);
  if(r<(blackhole?2.0001:.035)*mass){finished=true;break;}
  if(r>70.+r0&&dot(p,v)>0.){finalCol=environment(normalize(v));finished=true;break;}
  float qualityStep=steps>300?.065:(steps>180?.10:.16);
  float h=clamp(r*qualityStep,.004*mass,2.)/max(length(v),1.);
  // Velocity Verlet: two force samples, with short adaptive steps near the core.
  vec3 a=lensing?acceleration(p,L2,Q2):vec3(0);
  if(!lensing)v=dir;
  vec3 next=p+v*h+.5*a*h*h;
  vec3 nextV=v+.5*(a+(lensing?acceleration(next,L2,Q2):vec3(0)))*h;
  vec3 segment=next-p;float segmentLength=length(segment);vec3 sd=segment/max(segmentLength,1e-8);
  float best=1e10;vec3 cubeHit=vec3(0),cubeNormal=vec3(0),cubeColor=vec3(0);bool hitCube=false;
  for(int j=0;j<8;j++){
   if(j>=cubeCount)break;
   if(distance(p,cubes[j].xyz)>segmentLength+cubes[j].w)continue;
   vec3 n,hit;if(intersectCube(p,sd,segmentLength,cubes[j],n,hit)){float dist=distance(p,hit);if(dist<best){best=dist;cubeHit=hit;cubeNormal=n;cubeColor=colors[j];hitCube=true;}}
  }
  float diskT=1e10;vec3 dp=vec3(0);
  if(disk&&p.y*next.y<=0.&&abs(segment.y)>1e-8){float t=-p.y/segment.y;dp=p+segment*t;float dr=length(dp.xz)/mass;if(dr>2.15&&dr<diskRadius)diskT=t*segmentLength;}
  if(diskT<best){
   float inner=blackhole?6.:2.15;
   float dr=length(dp.xz)/mass,ang=atan(dp.z,dp.x);float profile=pow(inner/dr,1.65)*smoothstep(inner,inner+.45,dr)*(1.-smoothstep(diskRadius-1.5,diskRadius,dr));
   // Advect every visible feature together. Inner material rotates faster;
   // this is an illustrative angular rate, not an accretion dynamics model.
   float omega=1.35*pow(inner/max(dr,inner),1.5);
   float phase=ang-time*omega;
   float spiral=phase*3.+dr*1.35;
   float rings=.62+.24*sin(dr*23.+sin(spiral)*2.);
   // Circular coordinates keep turbulence continuous across the angular seam.
   vec2 flow=vec2(cos(phase),sin(phase))*(4.+dr*.35);
   float swirl=.4+.75*noise(flow+vec2(dr*2.3));
   float ribbons=pow(.5+.5*cos(spiral),5.);
   float doppler=clamp(1.+.48*dot(sd,normalize(vec3(-dp.z,0,dp.x)))*sqrt(3./dr),.3,1.8);
   float intensity=profile*(rings*swirl+.55*ribbons)*brightness*doppler*2.7;
   vec3 hot=mix(vec3(1.,.19,.035),vec3(1.,.78,.42),clamp(pow(inner/dr,.75),0.,1.));
   emission+=transmittance*hot*intensity;transmittance*=exp(-intensity*.52);
  }
  if(hitCube){
   vec3 local=cubeHit;vec3 n=cubeNormal;vec2 coord=abs(n.y)>.5?local.xz:(abs(n.x)>.5?local.zy:local.xy);
   float grid=min(abs(fract(coord.x*2.)-.5),abs(fract(coord.y*2.)-.5));float shade=.35+.65*max(dot(n,normalize(vec3(-.4,.8,.5))),0.);
   finalCol=cubeColor*shade*(grid<.025?.5:1.);finished=true;break;
  }
  p=next;v=nextV;
  if(transmittance<.008){finished=true;break;}
 }
 // Rays still trapped after the step budget are left dark rather than assigned an unphysical escape direction.
 vec3 col=emission+transmittance*finalCol;
 col=vec3(1.)-exp(-col*exposure);
 col=pow(max(col,vec3(0)),vec3(1./2.2));
 float vignette=1.-.16*pow(length((uv-.5)*1.15),2.);col*=vignette;
 fragColor=vec4(col,1.);
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas=canvas;
    this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    if(!this.gl)throw new Error('This experiment needs WebGL 2. Enable hardware acceleration or try a recent version of Chrome, Firefox, Safari, or Edge.');
    const gl=this.gl;
    const compile=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    this.uniforms={};for(const name of ['resolution','camera','forward','right','up','fov','mass','charge','time','exposure','brightness','diskRadius','skyRotation','disk','lensing','blackhole','nasaReady','skyMode','steps','cubeCount','cubes[0]','colors[0]','skyTexture'])this.uniforms[name]=gl.getUniformLocation(this.program,name);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([20,20,20,255]));
  }
  upload(image){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);if(gl.getError()!==gl.NO_ERROR)throw new Error('The GPU could not load this image. Try a smaller image.');}
  render(state,basis){
    const gl=this.gl,u=this.uniforms;const presets={low:[.5,144],medium:[.7,240],high:[1,360]};const [scale,steps]=presets[state.quality];
    const rect=this.canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio,1.5)*scale;const w=Math.max(1,Math.floor(rect.width*ratio)),h=Math.max(1,Math.floor(rect.height*ratio));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;gl.viewport(0,0,w,h);}
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.uniform2f(u.resolution,w,h);
    for(const name of ['camera','forward','right','up'])gl.uniform3fv(u[name],basis[name]);
    for(const name of ['mass','time','exposure','brightness','diskRadius'])gl.uniform1f(u[name],state[name]);
    gl.uniform1f(u.charge,state.blackhole?0:state.charge);gl.uniform1i(u.blackhole,state.blackhole?1:0);gl.uniform1i(u.nasaReady,state.nasaReady?1:0);
    gl.uniform1f(u.fov,state.fov*Math.PI/180);gl.uniform1f(u.skyRotation,state.skyRotation*Math.PI/180);
    gl.uniform1i(u.disk,state.disk?1:0);gl.uniform1i(u.lensing,state.lensing?1:0);gl.uniform1i(u.skyMode,state.skyMode);gl.uniform1i(u.steps,steps);gl.uniform1i(u.cubeCount,state.cubes.length);
    if(state.cubes.length){gl.uniform4fv(u['cubes[0]'],new Float32Array(state.cubes.flatMap(c=>[...c.position,c.size])));gl.uniform3fv(u['colors[0]'],new Float32Array(state.cubes.flatMap(c=>c.color.match(/\w\w/g).map(v=>Math.pow(parseInt(v,16)/255,2.2)))));}
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(u.skyTexture,0);gl.drawArrays(gl.TRIANGLES,0,3);
    return [w,h];
  }
}
