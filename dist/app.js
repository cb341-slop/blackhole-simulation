import {Renderer} from './renderer.js';
import {GeometryRenderer} from './geometry.js';
import {drawDiskUVReference} from './disk-uv.js';
import {inspectPixelRay} from './ray-inspector.js';
import {curvatureGeometry,tidalGeometry,tidalState} from './physics.js';

const $=id=>document.getElementById(id);
const canvas=$('universe');
const state={mass:1,charge:1.03,blackhole:true,physicsView:'none',curvatureScale:1,curvatureDensity:28,curvatureFlat:false,tidalProgress:0,tidalPlaying:true,tidalSize:1,tidalArrows:true,tidalGhost:true,pathView:false,compare:false,diagnostic:0,probe:false,nasaReady:false,disk:true,diskUV:false,diskUVRotate:false,brightness:1.5,diskRadius:14,skyMode:0,skyRotation:0,fov:55,exposure:1,quality:'medium',lensing:true,autoOrbit:false,time:0,paused:matchMedia('(prefers-reduced-motion: reduce)').matches,cubes:[]};
const debug={rays:false,center:false,rs:false,photon:false,grid:false,frustum:false,overlay:false,density:5};
const inspection={theta:.92,phi:1.06,distance:47,target:[0,0,3]};
const view={mode:'orbit',theta:.38,phi:1.30,distance:17,target:[0,0,0],position:[0,0,17],yaw:0,pitch:0};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),length=a=>Math.hypot(...a),norm=a=>mul(a,1/(length(a)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
let renderer,geometry,dirty=true,selected=-1,nextCubeId=1,last=performance.now(),frames=0,frameTime=0,toastTimer,uploadSource=null,uploadMode=3,uvAtlas=null,nasaImage=null,nasaLoadId=0,fall=null,pathViewInitialized=false;
let curvatureCache=null,curvatureCacheKey='';
const pointers=new Map(),keys=new Set();

function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3600);}
function fail(error){console.error(error);$('error').textContent=error.message||String(error);$('error').hidden=false;$('loading').classList.add('done');}
function basis(){
 let camera,forward;
 if(view.mode==='orbit'){
  const {theta,phi,distance,target}=view;camera=add(target,[distance*Math.sin(phi)*Math.sin(theta),distance*Math.cos(phi),distance*Math.sin(phi)*Math.cos(theta)]);forward=norm(sub(target,camera));
 }else{camera=view.position;forward=[Math.sin(view.yaw)*Math.cos(view.pitch),Math.sin(view.pitch),-Math.cos(view.yaw)*Math.cos(view.pitch)];}
 if(state.blackhole&&length(camera)<2.025*state.mass)camera=mul(norm(camera),2.025*state.mass);
 const right=norm(cross(forward,[0,1,0])),up=norm(cross(right,forward));return {camera,forward,right,up};
}
function inspectionBasis(){const {theta,phi,distance,target}=inspection;const camera=add(target,[distance*Math.sin(phi)*Math.sin(theta),distance*Math.cos(phi),distance*Math.sin(phi)*Math.cos(theta)]),forward=norm(sub(target,camera)),right=norm(cross(forward,[0,1,0]));return {camera,forward,right,up:norm(cross(right,forward))};}
function resetPhysicsCamera(){
 const m=state.mass;
 Object.assign(inspection,state.physicsView==='curvature'?{theta:.68,phi:1.05,distance:52*m,target:[0,-5*m,0]}:{theta:.38,phi:1.15,distance:29*m,target:[9*m,0,0]});
 dirty=true;
}
function syncPhysicsUI(){
 const mode=state.physicsView,active=mode!=='none';
 $('physicsView').value=mode;$('viewport').classList.toggle('physics-mode',active);
 $('curvatureViewBtn').setAttribute('aria-pressed',String(mode==='curvature'));$('tidalViewBtn').setAttribute('aria-pressed',String(mode==='tidal'));
 $('physicsHUD').hidden=!active;$('curvatureControls').hidden=mode!=='curvature';$('tidalControls').hidden=mode!=='tidal';
 $('curvatureKey').hidden=mode!=='curvature';$('tidalReadouts').hidden=mode!=='tidal';$('tidalHUDControls').hidden=mode!=='tidal';
 $('orbitBtn').disabled=active;$('flyBtn').disabled=active;
 $('distanceLabel').textContent=mode==='curvature'?'VIEW DISTANCE':mode==='tidal'?'CLOUD CENTRE RADIUS':'OBSERVER DISTANCE';
 if(mode==='curvature'){
  $('physicsTitle').textContent='SPATIAL CURVATURE · SCHWARZSCHILD';
  $('physicsDescription').textContent=`Equatorial spatial slice · 2M ≤ r ≤ 20M · vertical scale ${state.curvatureScale.toFixed(1)}×`;
  $('physicsNote').textContent=state.curvatureScale===1?'Exact spatial embedding. Height is an extra diagram coordinate, not a fall direction.':state.curvatureScale===0?'Flattened reference. Vertical scale 0 removes the displayed curvature.':'Vertical scale changed for display. Scale 1 preserves the spatial metric.';
 }else if(mode==='tidal'){
  const t=tidalState(state.tidalProgress);
  $('physicsTitle').textContent='SPAGHETTIFICATION · FREE-FALLING GRID';
  $('physicsDescription').textContent='Orange: radial stretch · cyan: transverse squeeze.'+(state.tidalGhost?' Pale box: original shape.':'')+' Orange sphere: horizon.';
  $('radialStretch').textContent=`${t.radial.toFixed(2)} ×`;$('transverseStretch').textContent=`${t.transverse.toFixed(2)} ×`;$('tidalRadius').textContent=(t.radius/2).toFixed(2);
  $('physicsNote').textContent=(state.tidalProgress>=1?'Centre stopped at 2.2M, outside the horizon. ':'')+'Enlarged local-frame diagram; particle positions are schematic. Ratios show physical linear tidal strain.';
 }
 $('tidalPlayBtn').textContent=$('tidalHUDPlay').textContent=state.tidalProgress>=1?'↺ Replay fall':state.tidalPlaying&&!state.paused?'Ⅱ Pause fall':'▷ Continue fall';
 $('tidalHUDProgress').value=state.tidalProgress;updateSlider('tidalHUDProgress');
 for(const id of ['curvatureScale','tidalSize','tidalProgress']){$(id).value=state[id];updateSlider(id);$(id+'Val').textContent=id==='tidalProgress'?Math.round(state[id]*100):state[id].toFixed(1);}
 dirty=true;
}
function setPhysicsView(mode){
 if(mode!=='none'){
  stopFall(false);if(!state.blackhole)setModel(true);setPathView(false);setComparison(false);
  state.diagnostic=0;$('diagnosticMode').value='0';state.probe=false;$('rayProbe').checked=false;updateDiagnosticUI();
 }
 state.physicsView=mode;syncPhysicsUI();
 if(mode!=='none'){
  resetPhysicsCamera();$('debugLegend').hidden=true;
  $('canvasHint').innerHTML='<span>↔</span> Drag to inspect <b>·</b> Scroll to zoom <b>·</b> WASD / Q E to pan';
 }else{
  Object.assign(inspection,{theta:.92,phi:1.06,distance:47,target:[0,0,3]});setPathView(state.pathView);
 }
 dirty=true;
}
$('physicsView').addEventListener('change',()=>setPhysicsView($('physicsView').value));
for(const mode of ['curvature','tidal'])$(mode+'ViewBtn').addEventListener('click',()=>setPhysicsView(state.physicsView===mode?'none':mode));
for(const id of ['curvatureScale','tidalSize'])$(id).addEventListener('input',()=>{state[id]=+$(id).value;syncPhysicsUI();});
$('curvatureDensity').addEventListener('change',()=>{state.curvatureDensity=+$('curvatureDensity').value;dirty=true;});
for(const id of ['curvatureFlat','tidalArrows','tidalGhost'])$(id).addEventListener('change',()=>{state[id]=$(id).checked;syncPhysicsUI();});
for(const id of ['tidalProgress','tidalHUDProgress'])$(id).addEventListener('input',()=>{state.tidalProgress=+$(id).value;state.tidalPlaying=false;syncPhysicsUI();});
function replayTides(){state.tidalProgress=0;state.tidalPlaying=true;state.paused=false;syncPause();syncPhysicsUI();}
for(const id of ['tidalReplayBtn','tidalHUDReplay'])$(id).addEventListener('click',replayTides);
for(const id of ['tidalPlayBtn','tidalHUDPlay'])$(id).addEventListener('click',()=>{if(state.tidalProgress>=1){replayTides();return;}if(state.paused){state.paused=false;state.tidalPlaying=true;syncPause();}else state.tidalPlaying=!state.tidalPlaying;syncPhysicsUI();});
function updateTides(dt){if(state.physicsView!=='tidal'||state.paused||!state.tidalPlaying)return;state.tidalProgress=Math.min(1,state.tidalProgress+dt/16);if(state.tidalProgress>=1)state.tidalPlaying=false;syncPhysicsUI();}
function setPathView(enabled){
 if(enabled&&state.physicsView!=='none')setPhysicsView('none');
 if(enabled){state.diagnostic=0;$('diagnosticMode').value='0';state.probe=false;$('rayProbe').checked=false;updateDiagnosticUI();}
 state.pathView=enabled;if(enabled){setComparison(false);if(!pathViewInitialized){for(const [id,key] of [['debugRays','rays'],['debugCenter','center'],['debugGrid','grid'],['debugFrustum','frustum']]){debug[key]=true;$(id).checked=true;}pathViewInitialized=true;}}
 $('pathView').checked=enabled;$('pathViewBtn').setAttribute('aria-pressed',String(enabled));$('pathViewBtn').textContent=enabled?'◉ Observer image':'⌁ Light paths';$('debugLegend').hidden=!enabled&&!debug.overlay;$('canvasHint').innerHTML=enabled?'<span>⌁</span> Drag to inspect rays <b>·</b> Scroll to zoom <b>·</b> WASD moves observer':'<span>↔</span> Drag to orbit <b>·</b> Scroll to zoom <b>·</b> WASD to move';dirty=true;
}
function setComparison(enabled){
 if(enabled&&state.physicsView!=='none')setPhysicsView('none');
 if(enabled&&state.pathView)setPathView(false);state.compare=enabled;$('compareView').checked=enabled;$('compareViewBtn').setAttribute('aria-pressed',String(enabled));$('compareViewBtn').textContent=enabled?'◫ Single view':'◫ Compare lensing';$('comparisonLabels').hidden=!enabled;$('viewport').classList.toggle('comparing',enabled);$('lensing').disabled=enabled;dirty=true;
}
$('compareViewBtn').addEventListener('click',()=>setComparison(!state.compare));$('compareView').addEventListener('change',()=>setComparison($('compareView').checked));
$('pathViewBtn').addEventListener('click',()=>setPathView(!state.pathView));$('pathView').addEventListener('change',()=>setPathView($('pathView').checked));
for(const [id,key] of [['debugRays','rays'],['debugCenter','center'],['debugRs','rs'],['debugPhoton','photon'],['debugGrid','grid'],['debugFrustum','frustum'],['debugOverlay','overlay']])$(id).addEventListener('change',()=>{debug[key]=$(id).checked;$('debugLegend').hidden=!state.pathView&&!debug.overlay;dirty=true;});
$('rayDensity').addEventListener('change',()=>{debug.density=+$('rayDensity').value;dirty=true;});
const diagnosticDescriptions={1:['RAY INTEGRATION STEPS','0 steps → selected step budget'],2:['CLOSEST APPROACH','12M+ (blue) → 0M (red)'],3:['NET DIRECTION CHANGE','0° (blue) → 180° (red)'],4:['DISK CROSSINGS','None · 1 cyan · 2 amber · 3+ pink'],5:['RAY TERMINATION','Escape teal · horizon black · core purple · cube yellow · budget red']};
function updateDiagnosticUI(){
 const info=diagnosticDescriptions[state.diagnostic];$('diagnosticLegend').hidden=!info;if(info){$('diagnosticTitle').textContent=info[0];$('diagnosticScale').textContent=info[1];$('diagnosticRamp').hidden=state.diagnostic>3;}
 $('probePanel').hidden=!state.probe;if(!state.probe)$('probeMarker').hidden=true;dirty=true;
}
$('diagnosticMode').addEventListener('change',()=>{state.diagnostic=+$('diagnosticMode').value;if(state.diagnostic){if(state.physicsView!=='none')setPhysicsView('none');setPathView(false);}updateDiagnosticUI();});
$('rayProbe').addEventListener('change',()=>{state.probe=$('rayProbe').checked;if(state.probe){if(state.physicsView!=='none')setPhysicsView('none');setPathView(false);}updateDiagnosticUI();});
$('closeProbeBtn').addEventListener('click',()=>{state.probe=false;$('rayProbe').checked=false;updateDiagnosticUI();});
function setModel(blackhole){
 if(!blackhole&&state.physicsView!=='none')setPhysicsView('none');
 stopFall(false);state.blackhole=blackhole;$('nakedModelBtn').classList.toggle('active',!blackhole);$('blackholeModelBtn').classList.toggle('active',blackhole);$('nakedModelBtn').setAttribute('aria-pressed',String(!blackhole));$('blackholeModelBtn').setAttribute('aria-pressed',String(blackhole));
 $('charge').disabled=blackhole;$('charge').closest('.control-section').classList.toggle('blackhole-model',blackhole);$('modelStatus').textContent=blackhole?'SCHWARZSCHILD BLACK HOLE':'NAKED SINGULARITY';
 $('horizonReadout').innerHTML=blackhole?`${(2*state.mass).toFixed(2)} <small>GM/c²</small>`:'None <small>Q &gt; M</small>';$('rsHelp').textContent=blackhole?'Event horizon of the Schwarzschild black hole':'Reference only; not a horizon for Q > M';$('diskRadius').min=blackhole?'7':'4';if(blackhole)state.diskRadius=Math.max(7,state.diskRadius);syncParams();
}
$('nakedModelBtn').addEventListener('click',()=>setModel(false));$('blackholeModelBtn').addEventListener('click',()=>setModel(true));
function startFall(){
 if(state.physicsView!=='none')setPhysicsView('none');
 setModel(true);setPathView(false);resetCamera();view.distance=18*state.mass;view.phi=1.39;view.theta=.1;state.paused=false;state.autoOrbit=false;$('autoOrbit').checked=false;syncPause();fall={elapsed:0,duration:14,start:18*state.mass};$('fallOverlay').hidden=false;$('fallBtn').textContent='↓ Descent in progress…';$('fallBtn').disabled=true;dirty=true;
}
function stopFall(reset=true){fall=null;$('fallOverlay').hidden=true;$('horizonFade').style.opacity=0;$('fallBtn').innerHTML='↓ Fall into a black hole <span>PLAY ANIMATION</span>';$('fallBtn').disabled=false;if(reset)resetCamera();dirty=true;}
function updateFall(dt){if(!fall||state.paused)return;fall.elapsed+=dt;const t=Math.min(fall.elapsed/fall.duration,1),r0=fall.start,end=2.025*state.mass;view.distance=Math.pow(Math.pow(r0,1.5)+(Math.pow(end,1.5)-Math.pow(r0,1.5))*t,2/3);view.theta=.1+t*.08;$('fallProgress').style.width=`${t*100}%`;$('fallStatus').textContent=t<.96?`Approaching the horizon · r / 2M = ${(view.distance/(2*state.mass)).toFixed(2)}`:'Horizon reached · observation ends';$('horizonFade').style.opacity=Math.max(0,(t-.94)/.06);dirty=true;if(t>=1){state.paused=true;syncPause();fall=null;$('fallStatus').textContent='Horizon reached · observation ends';$('fallBtn').innerHTML='↺ Replay the descent';$('fallBtn').disabled=false;}}
$('fallBtn').addEventListener('click',startFall);$('stopFallBtn').addEventListener('click',()=>stopFall());
function setMode(mode){
 if(mode===view.mode)return;const b=basis();
 if(mode==='fly'){view.position=[...b.camera];view.yaw=Math.atan2(b.forward[0],-b.forward[2]);view.pitch=Math.asin(b.forward[1]);}
 else{view.distance=Math.max(3,length(b.camera));view.target=[0,0,0];view.theta=Math.atan2(b.camera[0],b.camera[2]);view.phi=Math.acos(Math.max(-.995,Math.min(.995,b.camera[1]/view.distance)));}
 view.mode=mode;$('orbitBtn').classList.toggle('active',mode==='orbit');$('flyBtn').classList.toggle('active',mode==='fly');
 $('canvasHint').innerHTML=mode==='orbit'?'<span>↔</span> Drag to orbit <b>·</b> Scroll to zoom <b>·</b> WASD to move':'<span>⌖</span> Drag to look <b>·</b> WASD move <b>·</b> Q / E down / up';dirty=true;
}
function resetCamera(){if(state.physicsView!=='none'){resetPhysicsCamera();return;}view.mode='fly';setMode('orbit');Object.assign(view,{theta:.38,phi:1.30,distance:17,target:[0,0,0]});Object.assign(inspection,{theta:.92,phi:1.06,distance:47,target:[0,0,3]});dirty=true;}
function updateSlider(id){const el=$(id);el.style.setProperty('--fill',`${100*(+el.value-+el.min)/(+el.max-+el.min)}%`);}
function syncParams(){
 for(const id of ['mass','charge','brightness','diskRadius','skyRotation','fov','exposure']){const el=$(id);el.value=state[id];updateSlider(id);const digits={mass:2,charge:3,brightness:1,diskRadius:1,exposure:1};$(id+'Val').textContent=state[id].toFixed(digits[id]??0);}
 for(const id of ['disk','lensing','autoOrbit'])$(id).checked=state[id];$('quality').value=state.quality;$('diskControls').style.opacity=state.disk?'1':'.35';
 $('photonNote').textContent=state.blackhole?'Photon sphere at 3M · event horizon at 2M':state.charge<=Math.sqrt(9/8)?'Photon sphere present · no event horizon':'No photon sphere · no event horizon';
 $('horizonReadout').innerHTML=state.blackhole?`${(2*state.mass).toFixed(2)} <small>GM/c²</small>`:'None <small>Q &gt; M</small>';
 if(state.blackhole)$('chargeVal').textContent='0.000';
 $('diskUV').checked=state.diskUV;$('diskUVRotate').checked=state.diskUVRotate;$('diskUVKey').hidden=!state.diskUV;
 $('diskUVBounds').textContent=`V 0 → ${(state.blackhole?6:2.15).toFixed(2)} M  ·  V 1 → ${state.diskRadius.toFixed(2)} M`;
 dirty=true;
}
for(const id of ['mass','charge','brightness','diskRadius','skyRotation','fov','exposure'])$(id).addEventListener('input',()=>{if(id==='mass'&&state.physicsView!=='none'){const ratio=+$(id).value/state.mass;inspection.distance*=ratio;inspection.target=mul(inspection.target,ratio);}state[id]=+$(id).value;syncParams();if(id==='mass'||id==='charge')document.querySelectorAll('.preset').forEach(b=>b.classList.remove('active'));});
for(const id of ['disk','lensing','autoOrbit'])$(id).addEventListener('change',()=>{state[id]=$(id).checked;syncParams();});
$('diskUV').addEventListener('change',()=>{state.diskUV=$('diskUV').checked;if(state.diskUV){if(state.physicsView!=='none')setPhysicsView('none');state.diagnostic=0;$('diagnosticMode').value='0';updateDiagnosticUI();state.disk=true;setPathView(false);setUVReferenceFace(false);}syncParams();});
$('diskUVRotate').addEventListener('change',()=>{state.diskUVRotate=$('diskUVRotate').checked;dirty=true;});
$('uvTopBtn').addEventListener('click',()=>setUVReferenceFace(false));$('uvBottomBtn').addEventListener('click',()=>setUVReferenceFace(true));
function setUVReferenceFace(bottom){drawDiskUVReference($('diskUVReference'),bottom);$('uvTopBtn').classList.toggle('active',!bottom);$('uvBottomBtn').classList.toggle('active',bottom);$('uvTopBtn').setAttribute('aria-pressed',String(!bottom));$('uvBottomBtn').setAttribute('aria-pressed',String(bottom));}
$('quality').addEventListener('change',()=>{state.quality=$('quality').value;dirty=true;});
function preset(name){if(name==='classic'||name==='repulsive')setModel(false);Object.assign(state,{mass:1,charge:1.03,disk:true,brightness:1.5,diskRadius:14,lensing:true});if(name==='repulsive'){state.charge=1.35;}if(name==='clear')state.disk=false;document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active',b.dataset.preset===name));syncParams();}
document.querySelectorAll('.preset').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.preset)));
$('resetParamsBtn').addEventListener('click',()=>{setModel(true);preset('default');});
$('orbitBtn').addEventListener('click',()=>setMode('orbit'));
$('flyBtn').addEventListener('click',()=>setMode('fly'));
$('resetCameraBtn').addEventListener('click',()=>{stopFall(false);resetCamera();});
function syncPause(){if(state.physicsView!=='none')syncPhysicsUI();$('pauseIcon').textContent=state.paused?'▷':'Ⅱ';$('pauseText').textContent=state.paused?'Play':'Pause';$('pauseBtn').setAttribute('aria-label',state.paused?'Play animation':'Pause animation');$('pauseBtn').setAttribute('aria-pressed',String(state.paused));}
function togglePause(){state.paused=!state.paused;syncPause();dirty=true;}
$('pauseBtn').addEventListener('click',togglePause);
$('panelBtn').addEventListener('click',()=>{document.body.classList.toggle('panel-hidden');dirty=true;});
$('mapToggle').addEventListener('click',()=>{const collapsed=$('observerMap').classList.toggle('collapsed');$('mapToggle').textContent=collapsed?'+':'−';$('mapToggle').setAttribute('aria-expanded',String(!collapsed));$('mapToggle').setAttribute('aria-label',`${collapsed?'Expand':'Collapse'} camera overview`);dirty=true;});
$('fullscreenBtn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('viewport').requestFullscreen)await $('viewport').requestFullscreen();else{document.body.classList.toggle('panel-hidden');toast('Expanded view');}dirty=true;}catch{toast('Fullscreen is unavailable in this browser.');}});
$('screenshotBtn').addEventListener('click',()=>{if(!renderer)return;renderScene();canvas.toBlob(blob=>{if(!blob){toast('Could not capture this frame.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`singularity-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Screenshot saved as PNG');});});
$('aboutBtn').addEventListener('click',()=>$('aboutDialog').showModal());$('closeAboutBtn').addEventListener('click',()=>$('aboutDialog').close());$('aboutDialog').addEventListener('click',e=>{if(e.target===$('aboutDialog')){const r=$('aboutDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('aboutDialog').close();}});

canvas.addEventListener('pointerdown',e=>{canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});});
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;const previous=pointers.get(e.pointerId),dx=e.clientX-previous.x,dy=e.clientY-previous.y;
 if(pointers.size===2){const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1];const before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(before>1&&after>1)zoom(Math.log(before/after)*1000);}
 else if(state.pathView||state.physicsView!=='none'){inspection.theta-=dx*.005;inspection.phi=Math.max(.04,Math.min(Math.PI-.04,inspection.phi+dy*.005));}
 else if(view.mode==='orbit'){view.theta-=dx*.005;view.phi=Math.max(.04,Math.min(Math.PI-.04,view.phi+dy*.005));}
 else{view.yaw+=dx*.004;view.pitch=Math.max(-1.53,Math.min(1.53,view.pitch-dy*.004));}
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dirty=true;
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>pointers.delete(e.pointerId));
function zoom(delta){if(state.pathView||state.physicsView!=='none')inspection.distance=Math.max(3*state.mass,Math.min(160*state.mass,inspection.distance*Math.exp(delta*.001)));else if(view.mode==='orbit')view.distance=Math.max(state.blackhole?2.025*state.mass:2.8,Math.min(65,view.distance*Math.exp(delta*.001)));else{const b=basis();view.position=add(view.position,mul(b.forward,-delta*.012));}dirty=true;}
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY);},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
let lastProbe=0,probePoint=null;
function updateProbe(point){
 if(!state.probe||state.pathView||!point)return;
 const rect=canvas.getBoundingClientRect(),x=point.x,y=point.y;if(x<0||y<0||x>rect.width||y>rect.height)return;
 const ray=inspectPixelRay(state,basis(),{x,y,width:rect.width,height:rect.height}),hit=ray.firstHit;
 $('probeView').textContent=`${ray.lensing?'LENSING ON':'LENSING OFF'} · CPU REFERENCE`;
 $('probeHit').textContent=hit?.kind==='disk'?`${hit.face} ${hit.label}`:hit?.kind==='cube'?`Cube ${String(hit.id).padStart(2,'0')}`:'No disk / cube hit';
 $('probeUV').textContent=hit?.kind==='disk'?`${hit.u.toFixed(3)} / ${hit.v.toFixed(3)}`:'—';
 $('probeRadius').textContent=hit?.kind==='disk'?`${hit.radius.toFixed(3)} M`:'—';
 $('probeClosest').textContent=`${(ray.minRadius/state.mass).toFixed(3)} M`;
 $('probeOutcome').textContent=ray.status;$('probeCrossings').textContent=String(ray.crossings);$('probeSteps').textContent=String(ray.iterations);
 $('probeEnergy').textContent=ray.lensing?`${(ray.maxError*100).toFixed(4)} %`:'N/A · straight rays';
 $('probeMarker').hidden=false;$('probeMarker').style.left=`${x}px`;$('probeMarker').style.top=`${y}px`;
}
canvas.addEventListener('pointermove',e=>{probePoint={x:e.clientX-canvas.getBoundingClientRect().left,y:e.clientY-canvas.getBoundingClientRect().top};const now=performance.now();if(state.probe&&now-lastProbe>90){lastProbe=now;updateProbe(probePoint);}});
canvas.addEventListener('pointerleave',()=>{$('probeMarker').hidden=true;probePoint=null;});
function isEditing(e){return /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)||$('aboutDialog').open;}
window.addEventListener('keydown',e=>{if(isEditing(e))return;const key=e.key.toLowerCase();if(['w','a','s','d','q','e','shift','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)){e.preventDefault();keys.add(key);}if(e.repeat)return;if(key===' ')togglePause();if(key==='f')resetCamera();if(key==='c')addCube();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();pointers.clear();});
function moveCamera(dt){
 if(!keys.size||$('aboutDialog').open)return;const b=state.physicsView!=='none'?inspectionBasis():basis(),speed=dt*(keys.has('shift')?9:3);let delta=[0,0,0];
 if(keys.has('w')||keys.has('arrowup'))delta=add(delta,mul(b.forward,speed));if(keys.has('s')||keys.has('arrowdown'))delta=add(delta,mul(b.forward,-speed));
 if(keys.has('d')||keys.has('arrowright'))delta=add(delta,mul(b.right,speed));if(keys.has('a')||keys.has('arrowleft'))delta=add(delta,mul(b.right,-speed));
 if(keys.has('e'))delta[1]+=speed;if(keys.has('q'))delta[1]-=speed;
 if(state.physicsView!=='none')inspection.target=add(inspection.target,delta);else if(view.mode==='orbit')view.target=add(view.target,delta);else view.position=add(view.position,delta);
 // Static observers are undefined at the mathematical singularity itself.
 if(view.mode==='fly'&&length(view.position)<.25*state.mass)view.position=mul(norm(view.position),.25*state.mass);dirty=true;
}

function addCube(){
 if(state.physicsView!=='none')setPhysicsView('none');
 if(state.cubes.length>=8){toast('Eight cubes is the limit for this experiment.');return;}
 const b=basis(),p=add(b.camera,mul(b.forward,7));const palette=['#c2e5e4','#e8b17b','#b4c896','#c5a6d9','#e39b91','#98b6df','#e0cf80','#b8b8ad'];
 state.cubes.push({id:nextCubeId++,position:p.map(v=>Math.max(-25,Math.min(25,Math.round(v*4)/4))),size:1,color:palette[state.cubes.length]});selected=state.cubes.length-1;syncCubes();toast('Cube placed in front of you · edit its coordinates below');
}
function syncCubes(){
 $('cubeCount').textContent=`${state.cubes.length} / 8`;$('addCubeBtn').disabled=state.cubes.length>=8;$('cubeList').replaceChildren();
 state.cubes.forEach((c,i)=>{const b=document.createElement('button');b.className=`cube-chip${i===selected?' active':''}`;b.style.setProperty('--cube-color',c.color);const dot=document.createElement('i');b.append(dot,`Cube ${String(c.id).padStart(2,'0')}`);b.addEventListener('click',()=>{selected=i;syncCubes();});$('cubeList').append(b);});
 const c=state.cubes[selected];$('cubeEditor').hidden=!c;
 if(c){$('selectedName').textContent=`Cube ${String(c.id).padStart(2,'0')}`;['X','Y','Z'].forEach((v,i)=>$('cube'+v).value=+c.position[i].toFixed(2));$('cubeSize').value=c.size;$('cubeSizeVal').textContent=c.size.toFixed(2);$('cubeColor').value=c.color;updateSlider('cubeSize');}dirty=true;
}
$('addCubeBtn').addEventListener('click',addCube);
['X','Y','Z'].forEach((axis,i)=>$('cube'+axis).addEventListener('input',()=>{const c=state.cubes[selected],v=+$('cube'+axis).value;if(c&&Number.isFinite(v)){c.position[i]=Math.max(-25,Math.min(25,v));dirty=true;}}));
$('cubeSize').addEventListener('input',()=>{if(state.cubes[selected]){state.cubes[selected].size=+$('cubeSize').value;$('cubeSizeVal').textContent=(+$('cubeSize').value).toFixed(2);updateSlider('cubeSize');dirty=true;}});
$('cubeColor').addEventListener('input',()=>{if(state.cubes[selected]){state.cubes[selected].color=$('cubeColor').value;syncCubes();}});
$('deleteCubeBtn').addEventListener('click',()=>{state.cubes.splice(selected,1);selected=Math.min(selected,state.cubes.length-1);syncCubes();});
$('cubeFrontBtn').addEventListener('click',()=>{const b=basis();if(state.cubes[selected])state.cubes[selected].position=add(b.camera,mul(b.forward,7)).map(v=>Math.max(-25,Math.min(25,v)));syncCubes();});

function createUVAtlas(){
 const size=384,c=document.createElement('canvas');c.width=size*6;c.height=size;const ctx=c.getContext('2d');
 const names=['+X','−X','+Y','−Y','+Z','−Z'],directions=['RIGHT','LEFT','UP','DOWN','FRONT','BACK'],colors=['#9a6063','#5b9699','#829763','#a881aa','#b78b5b','#627d9d'];
 for(let face=0;face<6;face++){
  const x=face*size;ctx.fillStyle=colors[face];ctx.fillRect(x,0,size,size);
  for(let y=0;y<8;y++)for(let a=0;a<8;a++){ctx.fillStyle=(a+y)%2?'#ffffff13':'#00000012';ctx.fillRect(x+a*48,y*48,48,48);}
  ctx.strokeStyle='#eee9d990';ctx.lineWidth=1;for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(x+i*48,0);ctx.lineTo(x+i*48,size);ctx.moveTo(x,i*48);ctx.lineTo(x+size,i*48);ctx.stroke();}
  ctx.fillStyle='#17211f99';ctx.fillRect(x+95,120,194,144);ctx.fillStyle='#fff9e5';ctx.textAlign='center';ctx.font='500 74px sans-serif';ctx.fillText(names[face],x+192,202);ctx.font='14px monospace';ctx.fillText(directions[face],x+192,239);
  ctx.font='12px monospace';ctx.fillStyle='#ffffffbb';for(let j=0;j<8;j++){ctx.fillText((j/8).toFixed(2),x+j*48+24,23);ctx.fillText((j/8).toFixed(2),x+25,j*48+38);}
  ctx.strokeStyle='#fff9e5';ctx.lineWidth=2;ctx.strokeRect(x+3,3,size-6,size-6);
 }return c;
}
function selectSky(mode){
 state.skyMode=mode;document.querySelectorAll('.sky-card').forEach(b=>b.classList.toggle('active',+b.dataset.sky===mode));
 if(mode===0&&nasaImage)renderer.upload(nasaImage);else if(mode===1)renderer.upload(uvAtlas);else if(mode===3||mode===4){if(uploadSource)renderer.upload(uploadSource);else return;}
 $('skyCredit').hidden=mode!==0;
 dirty=true;
}
document.querySelectorAll('.sky-card').forEach(b=>b.addEventListener('click',()=>{if(renderer)selectSky(+b.dataset.sky);}));
async function loadNASA(){
 const id=++nasaLoadId,requested=$('nasaQuality').value,max=renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE);let resolution=requested==='16k'?16384:8192;
 if(max<resolution){resolution=max>=8192?8192:4096;toast(`This GPU supports a ${resolution}px sky texture; using its maximum.`);}
 $('skyResolution').textContent=`Loading ${resolution===16384?'16K':resolution===8192?'8K':'4K'} NASA star map…`;
 try{const image=new Image();image.decoding='async';await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=`assets/nasa-starmap-${resolution===16384?'16k':'8k'}.jpg`;});if(id!==nasaLoadId)return;nasaImage=image.width>max?resizeImage(image,max,max/2):image;
  state.nasaReady=true;if(state.skyMode===0)renderer.upload(nasaImage);$('skyResolution').textContent=`${nasaImage.width.toLocaleString()} × ${nasaImage.height.toLocaleString()} · all-sky panorama`;
  dirty=true;
 }catch{$('skyResolution').textContent='NASA sky unavailable · procedural fallback';toast('NASA texture could not load; the procedural night sky remains available.');}
}
$('nasaQuality').addEventListener('change',()=>{if(renderer)loadNASA();});
let uploadedImages=[];
function resizeImage(source,maxWidth=4096,maxHeight=4096){const scale=Math.min(1,maxWidth/source.width,maxHeight/source.height);const c=document.createElement('canvas');c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));c.getContext('2d').drawImage(source,0,0,c.width,c.height);return c;}
function makeAtlas(images,layout){
 const first=images[0];let size=512;
 if(images.length===6)size=Math.min(512,...images.map(v=>Math.min(v.width,v.height)));
 else if(layout==='cross43')size=Math.min(512,first.width/4,first.height/3);
 else if(layout==='cross34')size=Math.min(512,first.width/3,first.height/4);
 else if(layout==='strip61')size=Math.min(512,first.width/6,first.height);
 else if(layout==='strip16')size=Math.min(512,first.width,first.height/6);
 size=Math.max(1,Math.floor(size));const c=document.createElement('canvas');c.width=size*6;c.height=size;const ctx=c.getContext('2d');
 const positions={cross43:[[2,1],[0,1],[1,0],[1,2],[1,1],[3,1]],cross34:[[2,1],[0,1],[1,0],[1,2],[1,1],[1,3]],strip61:[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]],strip16:[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]]};
 for(let i=0;i<6;i++){
  if(images.length===6)ctx.drawImage(images[i],i*size,0,size,size);
  else{const pos=positions[layout][i],cols=layout==='cross43'?4:layout==='cross34'?3:layout==='strip61'?6:1,rows=layout==='cross43'?3:layout==='cross34'?4:layout==='strip61'?1:6,sw=first.width/cols,sh=first.height/rows;
   if(layout==='cross34'&&i===5){ctx.save();ctx.translate(i*size+size,size);ctx.rotate(Math.PI);ctx.drawImage(first,pos[0]*sw,pos[1]*sh,sw,sh,0,0,size,size);ctx.restore();}
   else ctx.drawImage(first,pos[0]*sw,pos[1]*sh,sw,sh,i*size,0,size,size);
  }
 }return c;
}
function processUpload(){
 if(!uploadedImages.length||!renderer)return;let layout=$('layout').value;
 if(uploadedImages.length===6){layout='six';uploadMode=4;}
 else{const ratio=uploadedImages[0].width/uploadedImages[0].height;if(layout==='auto'){if(Math.abs(ratio-4/3)<.03)layout='cross43';else if(Math.abs(ratio-3/4)<.03)layout='cross34';else if(Math.abs(ratio-6)<.1)layout='strip61';else if(Math.abs(ratio-1/6)<.01)layout='strip16';else layout='panorama';}uploadMode=layout==='panorama'?3:4;}
 uploadSource=uploadMode===3?resizeImage(uploadedImages[0],4096,2048):makeAtlas(uploadedImages,layout);selectSky(uploadMode);
 const labels={six:'Six cube faces',panorama:'Equirectangular panorama',cross43:'Horizontal cube cross',cross34:'Vertical cube cross',strip61:'Horizontal cube strip',strip16:'Vertical cube strip'};
 $('uploadName').textContent=`${labels[layout]} · ${uploadSource.width} × ${uploadSource.height} · stays on your device`;
 $('layout').disabled=uploadedImages.length===6;toast('Your skybox is ready');
}
function orderFaces(files){
 const patterns=[/(^|[_.\- ])(px|posx|right)([_.\- ]|$)/i,/(^|[_.\- ])(nx|negx|left)([_.\- ]|$)/i,/(^|[_.\- ])(py|posy|top|up)([_.\- ]|$)/i,/(^|[_.\- ])(ny|negy|bottom|down)([_.\- ]|$)/i,/(^|[_.\- ])(pz|posz|front)([_.\- ]|$)/i,/(^|[_.\- ])(nz|negz|back)([_.\- ]|$)/i];
 const ordered=patterns.map(re=>files.find(f=>re.test(f.name)));if(ordered.every(Boolean)&&new Set(ordered).size===6)return ordered;toast('Faces sorted by filename: +X, −X, +Y, −Y, +Z, −Z');return files.sort((a,b)=>a.name.localeCompare(b.name));
}
async function loadImage(file){
 if(/\.hdr$/i.test(file.name))return decodeHDR(await file.arrayBuffer());
 const url=URL.createObjectURL(file);try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Could not read ${file.name}. Use a PNG, JPEG, WebP, AVIF, or Radiance HDR image.`));image.src=url;});}finally{URL.revokeObjectURL(url);}
}
$('skyFile').addEventListener('change',async e=>{
 let files=[...e.target.files];if(!files.length)return;if(files.length!==1&&files.length!==6){toast('Choose one panorama / atlas, or exactly six cube faces.');e.target.value='';return;}
 if(files.some(f=>f.size>100*1024*1024)){toast('Please use skybox files smaller than 100 MB each.');e.target.value='';return;}
 try{toast('Reading your skybox…');if(files.length===6)files=orderFaces(files);uploadedImages=await Promise.all(files.map(loadImage));$('uploadSettings').hidden=false;processUpload();}catch(error){toast(error.message);}finally{e.target.value='';}
});
$('layout').addEventListener('change',()=>{try{processUpload();}catch(error){toast(error.message);}});
$('useUploadBtn').addEventListener('click',()=>{if(uploadSource)selectSky(uploadMode);});

// Decode Radiance RGBE, including modern scanline RLE. Convert HDR to a display
// image locally; the scene exposure remains available for the final render.
function decodeHDR(buffer){
 const bytes=new Uint8Array(buffer);let cursor=0;
 function line(){const start=cursor;while(cursor<bytes.length&&bytes[cursor]!==10)cursor++;const s=new TextDecoder().decode(bytes.subarray(start,cursor));cursor++;return s.trim();}
 const magic=line();if(!/^#\?(RADIANCE|RGBE)/.test(magic))throw new Error('Not a supported Radiance HDR file.');
 let format='',text;while(cursor<bytes.length&&(text=line())!==''){if(text.startsWith('FORMAT='))format=text.slice(7);}
 if(format!=='32-bit_rle_rgbe')throw new Error('Use a Radiance RGBE HDR image (32-bit_rle_rgbe).');
 const dimensions=line().match(/^([+-])Y\s+(\d+)\s+([+-])X\s+(\d+)$/);if(!dimensions)throw new Error('Unsupported HDR orientation. Use a standard −Y +X Radiance export.');
 const h=+dimensions[2],w=+dimensions[4];if(w*h>33554432||w<1||h<1)throw new Error('HDR image is too large. Use at most 32 megapixels.');
 const raw=new Uint8Array(w*h*4),scan=new Uint8Array(w*4);
 function read(){if(cursor>=bytes.length)throw new Error('HDR file ended unexpectedly.');return bytes[cursor++];}
 for(let y=0;y<h;y++){
  if(w>=8&&w<=32767&&bytes[cursor]===2&&bytes[cursor+1]===2&&(bytes[cursor+2]&128)===0){
   cursor+=2;const width=read()*256+read();if(width!==w)throw new Error('HDR scanline width is invalid.');
   for(let channel=0;channel<4;channel++){let x=0;while(x<w){const code=read();if(code===0)throw new Error('HDR RLE run is invalid.');const count=code>128?code-128:code;if(x+count>w)throw new Error('HDR RLE run exceeds its scanline.');if(code>128){const value=read();for(let k=0;k<count;k++)scan[channel*w+x++]=value;}else for(let k=0;k<count;k++)scan[channel*w+x++]=read();}}
   for(let x=0;x<w;x++)for(let c=0;c<4;c++)raw[(y*w+x)*4+c]=scan[c*w+x];
  }else{for(let x=0;x<w;x++)for(let c=0;c<4;c++)raw[(y*w+x)*4+c]=read();}
 }
 const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),image=ctx.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const src=(y*w+x)*4,dy=dimensions[1]==='-'?y:h-1-y,dx=dimensions[3]==='+'?x:w-1-x,dst=(dy*w+dx)*4,scale=raw[src+3]?Math.pow(2,raw[src+3]-136):0;
  for(let k=0;k<3;k++){const linear=raw[src+k]*scale;image.data[dst+k]=Math.round(255*Math.pow(linear/(1+linear),1/2.2));}image.data[dst+3]=255;
 }ctx.putImageData(image,0,0);return resizeImage(c,4096,2048);
}

// A fixed external observer projects the coordinate-space scene as a wireframe.
// The frustum is built from the same camera basis, aspect, and FOV as the GPU.
function drawOverview(b){
 if($('observerMap').classList.contains('collapsed'))return;
 const map=$('mapCanvas'),ctx=map.getContext('2d'),rect=map.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);
 if(map.width!==Math.round(rect.width*dpr)||map.height!==Math.round(rect.height*dpr)){map.width=Math.round(rect.width*dpr);map.height=Math.round(rect.height*dpr);}
 const w=rect.width,h=rect.height;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const extForward=norm([-1,-.72,-1.15]),extRight=norm(cross(extForward,[0,1,0])),extUp=cross(extRight,extForward);
 const extent=Math.max(12,length(b.camera)*1.22,...state.cubes.map(c=>length(c.position)+c.size));const scale=Math.min(w,h)*.37/extent;
 const dot=(a,c)=>a.reduce((s,v,i)=>s+v*c[i],0);
 const project=p=>[w*.5+dot(p,extRight)*scale,h*.51-dot(p,extUp)*scale];
 const line=(a,c,color,width=1,dash=[])=>{const p=project(a),q=project(c);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();ctx.setLineDash([]);};
 const label=(p,text,color)=>{ctx.fillStyle=color;ctx.font='7px monospace';const q=project(p);ctx.fillText(text,q[0]+3,q[1]-3);};
 const grid=extent*.85;for(let i=-2;i<=2;i++){const v=i*grid/2;line([-grid,0,v],[grid,0,v],'#6f805026',.6);line([v,0,-grid],[v,0,grid],'#6f805026',.6);}
 const axis=extent*.8;line([0,0,0],[axis,0,0],'#ba8f6d88',.8);line([0,0,0],[0,axis,0],'#9ab58a88',.8);line([0,0,0],[0,0,axis],'#8ba1b688',.8);label([axis,0,0],'X','#ba8f6d');label([0,axis,0],'Y','#9ab58a');label([0,0,axis],'Z','#8ba1b6');
 const circle=(radius,plane,color)=>{let previous;for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;const p=plane==='xz'?[Math.cos(a)*radius,0,Math.sin(a)*radius]:plane==='xy'?[Math.cos(a)*radius,Math.sin(a)*radius,0]:[0,Math.cos(a)*radius,Math.sin(a)*radius];if(previous)line(previous,p,color,.65);previous=p;}};
 if(state.disk){circle(state.diskRadius*state.mass,'xz','#d5aa6f55');circle(2.15*state.mass,'xz','#d5aa6f66');}
 const coreRadius=Math.max((state.blackhole?2:.9)*state.mass,extent*.06);circle(coreRadius,'xz','#d5aa6faa');circle(coreRadius,'xy','#d5aa6f99');circle(coreRadius,'yz','#d5aa6f77');
 for(const c of state.cubes){const corners=Array.from({length:8},(_,i)=>add(c.position,[(i&1?1:-1)*c.size/2,(i&2?1:-1)*c.size/2,(i&4?1:-1)*c.size/2]));for(let i=0;i<8;i++)for(let bit=1;bit<=4;bit*=2)if(!(i&bit))line(corners[i],corners[i|bit],c.color+'bb',.8);}
 const aspect=canvas.clientWidth/canvas.clientHeight/(state.compare?2:1),tan=Math.tan(state.fov*Math.PI/360),near=.65,far=Math.min(8,length(b.camera)*.65);
 const plane=distance=>{const center=add(b.camera,mul(b.forward,distance));return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(center,add(mul(b.right,x*tan*distance*aspect),mul(b.up,y*tan*distance))));};
 const n=plane(near),f=plane(far);ctx.fillStyle='#e8b17b09';ctx.beginPath();f.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(...q);else ctx.moveTo(...q);});ctx.closePath();ctx.fill();
 for(let i=0;i<4;i++){line(n[i],n[(i+1)%4],'#e8b17bcc',1);line(f[i],f[(i+1)%4],'#e8b17b88',.8);line(b.camera,f[i],'#e8b17b99',.8);}
 const aim=view.mode==='orbit'?view.target:add(b.camera,mul(b.forward,Math.min(length(b.camera),24)));line(b.camera,aim,'#e8b17baa',.8,[2,3]);
 const look=project(aim);ctx.strokeStyle='#e8b17b99';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(look[0]-3,look[1]);ctx.lineTo(look[0]+3,look[1]);ctx.moveTo(look[0],look[1]-3);ctx.lineTo(look[0],look[1]+3);ctx.stroke();
 const marker=project(b.camera);ctx.fillStyle='#f4cf9e';ctx.beginPath();ctx.arc(...marker,2.6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e8b17b55';ctx.lineWidth=1;ctx.beginPath();ctx.arc(...marker,5,0,Math.PI*2);ctx.stroke();label(b.camera,'CAM','#f4cf9e');
 $('mapCoords').textContent=b.camera.map((v,i)=>`${'XYZ'[i]} ${v>=0?'+':''}${v.toFixed(1)}`).join(' · ');
 map.setAttribute('aria-label',`Wireframe overview. Camera at ${b.camera.map(v=>v.toFixed(1)).join(', ')}. Amber frustum indicates the ${state.fov} degree field of view and look direction. ${state.cubes.length} scene cubes.`);
}

function renderScene(){
 const b=basis();let size;
 if(state.pathView||state.physicsView!=='none'){
  // Resize through the normal renderer once; the external view is then drawn
  // directly with GPU lines, and does not need to ray trace every pixel.
  const rect=canvas.getBoundingClientRect(),scale=state.quality==='high'?1:state.quality==='low'?.6:.85,ratio=Math.min(devicePixelRatio,1.5)*scale,w=Math.max(1,Math.floor(rect.width*ratio)),h=Math.max(1,Math.floor(rect.height*ratio));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}renderer.gl.viewport(0,0,w,h);size=[w,h];
  if(state.physicsView==='curvature'){
   const key=JSON.stringify([state.mass,state.curvatureScale,state.curvatureDensity,state.curvatureFlat]);
   if(key!==curvatureCacheKey){curvatureCacheKey=key;curvatureCache=curvatureGeometry(state);}
   geometry.renderCustom(curvatureCache,inspectionBasis());
  }else if(state.physicsView==='tidal')geometry.renderCustom(tidalGeometry(state),inspectionBasis());
  else geometry.render(state,b,debug,inspectionBasis(),{clear:true});
 }else{size=renderer.render(state,b);if(debug.overlay){
  if(state.compare){const [w,h]=size,left=Math.floor(w/2),aspect=canvas.clientWidth/canvas.clientHeight/2;renderer.gl.viewport(0,0,left,h);geometry.render({...state,lensing:true},b,debug,b,{aspect});renderer.gl.viewport(left,0,w-left,h);geometry.render({...state,lensing:false},b,debug,b,{aspect});renderer.gl.viewport(0,0,w,h);}
  else geometry.render(state,b,debug,b);
 }}
 if(state.physicsView==='none')drawOverview(b);if(state.probe&&performance.now()-lastProbe>150){lastProbe=performance.now();updateProbe(probePoint);}return {b,size};
}
let firstFrame=true;
function frame(now){
 const dt=Math.min((now-last)/1000,.06);last=now;
 if(document.hidden){requestAnimationFrame(frame);return;}
 updateFall(dt);updateTides(dt);if(!fall)moveCamera(dt);if(!state.paused)state.time+=dt;if(state.autoOrbit&&!state.paused&&(state.physicsView!=='none'||view.mode==='orbit')){if(state.physicsView!=='none')inspection.theta+=dt*.065;else view.theta+=dt*.065;dirty=true;}
 const animated=(!state.paused&&state.physicsView==='none'&&(state.disk||state.skyMode===0||state.pathView))||(!state.paused&&state.autoOrbit);
 if(dirty||animated){
  try{const {b,size:[w,h]}=renderScene();$('distanceReadout').innerHTML=`${(state.physicsView==='curvature'?inspection.distance:state.physicsView==='tidal'?tidalState(state.tidalProgress).radius*state.mass:length(b.camera)).toFixed(1)} <small>GM/c²</small>`;$('resolution').textContent=`${w} × ${h} · ${state.physicsView==='curvature'?'CURVATURE':state.physicsView==='tidal'?'TIDAL GRID':state.pathView?'LIGHT PATHS':'WEBGL 2'}`;dirty=false;frames++;
   if(firstFrame){$('loading').classList.add('done');firstFrame=false;}
  }catch(error){fail(error);return;}
 }
 frameTime+=dt;if(frameTime>=1){$('fps').textContent=`${Math.round(frames/frameTime)} FPS${state.paused?' · PAUSED':''}`;frames=0;frameTime=0;}
 requestAnimationFrame(frame);
}
new ResizeObserver(()=>dirty=true).observe($('viewport'));
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(new Error('The GPU context was interrupted. Reload this page to resume the experiment.'));});
try{renderer=new Renderer(canvas);geometry=new GeometryRenderer(renderer.gl);uvAtlas=createUVAtlas();setModel(true);syncCubes();syncPause();syncPhysicsUI();loadNASA();requestAnimationFrame(frame);}catch(error){fail(error);}
