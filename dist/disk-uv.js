export const UV_SECTORS=8;
export const UV_BANDS=4;

// U wraps around the disk; V runs from its inner edge to its outer edge.
// The same cell colors and identifiers are used in the GPU texture and key.
export function diskUVColor(sector,band,bottom=false){return `hsl(${(bottom?184:4)+sector*(bottom?13:8)} 73% ${32+band*8+(sector+band)%2*6}%)`;}
export function diskUVLabel(sector,band){return `${String.fromCharCode(65+sector)}${band+1}`;}
export function diskUVAt(x,z,inner,outer,time=0,rotate=false){
 const radius=Math.hypot(x,z),omega=1.35*Math.pow(inner/Math.max(radius,inner),1.5);
 const angular=Math.atan2(z,x)-(rotate?time*omega:0);
 return {u:((angular/(2*Math.PI)+.5)%1+1)%1,v:Math.max(0,Math.min(1,(radius-inner)/(outer-inner)))};
}
export function createDiskUVTexture(){
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;
 const ctx=canvas.getContext('2d'),cw=canvas.width/UV_SECTORS,ch=canvas.height/(UV_BANDS*2);
 for(let side=0;side<2;side++)for(let band=0;band<UV_BANDS;band++)for(let sector=0;sector<UV_SECTORS;sector++){
  const x=sector*cw,y=(band+side*UV_BANDS)*ch;ctx.fillStyle=diskUVColor(sector,band,side===1);ctx.fillRect(x,y,cw,ch);
  ctx.strokeStyle='#101715';ctx.lineWidth=7;ctx.strokeRect(x,y,cw,ch);
  ctx.strokeStyle='#fff8dc77';ctx.lineWidth=2;ctx.strokeRect(x+7,y+7,cw-14,ch-14);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 25px sans-serif';ctx.lineWidth=5;ctx.strokeStyle='#0b1519';ctx.fillStyle='#fffbed';ctx.strokeText(side?'BOTTOM':'TOP',x+cw/2,y+ch*.19);ctx.fillText(side?'BOTTOM':'TOP',x+cw/2,y+ch*.19);ctx.font='bold 66px sans-serif';ctx.lineWidth=7;ctx.strokeText(diskUVLabel(sector,band),x+cw/2,y+ch*.43);ctx.fillText(diskUVLabel(sector,band),x+cw/2,y+ch*.43);
  ctx.font='16px monospace';ctx.lineWidth=4;const coordinates=`U ${((sector+.5)/UV_SECTORS).toFixed(2)}  V ${((band+.5)/UV_BANDS).toFixed(2)}`;ctx.strokeText(coordinates,x+cw/2,y+ch*.65);ctx.fillText(coordinates,x+cw/2,y+ch*.65);
  ctx.font='20px sans-serif';ctx.fillText('U →',x+cw*.79,y+ch*.86);ctx.fillText('V ↓',x+cw*.23,y+ch*.86);
 }return canvas;
}
export function drawDiskUVReference(canvas,bottom=false){
 const dpr=Math.min(devicePixelRatio||1,2),w=280,h=254;canvas.width=w*dpr;canvas.height=h*dpr;
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const cx=140,cy=125,r0=30,r1=105;
 for(let band=0;band<UV_BANDS;band++)for(let sector=0;sector<UV_SECTORS;sector++){
  const a0=(sector/UV_SECTORS-.5)*Math.PI*2,a1=((sector+1)/UV_SECTORS-.5)*Math.PI*2,ri=r0+(r1-r0)*band/UV_BANDS,ro=r0+(r1-r0)*(band+1)/UV_BANDS;
  ctx.beginPath();ctx.arc(cx,cy,ro,-a0,-a1,true);ctx.arc(cx,cy,ri,-a1,-a0,false);ctx.closePath();ctx.fillStyle=diskUVColor(sector,band,bottom);ctx.fill();ctx.strokeStyle='#111c14';ctx.lineWidth=1.1;ctx.stroke();
  const angle=(a0+a1)/2,r=(ri+ro)/2;ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff9e6';ctx.strokeStyle='#152019';ctx.lineWidth=2;const label=diskUVLabel(sector,band),x=cx+Math.cos(angle)*r,y=cy-Math.sin(angle)*r;ctx.strokeText(label,x,y);ctx.fillText(label,x,y);
 }
 ctx.font='8px monospace';ctx.textAlign='center';ctx.fillStyle='#b6c9a3';ctx.fillText('V = 0',cx,cy-5);ctx.fillStyle='#7d9270';ctx.fillText('INNER',cx,cy+7);
 ctx.fillStyle='#aebc9b';ctx.fillText('U .75',cx,10);ctx.fillText('U .25',cx,244);ctx.textAlign='left';ctx.fillText('U 0',2,cy);ctx.textAlign='right';ctx.fillText('U .5',278,cy);
}
