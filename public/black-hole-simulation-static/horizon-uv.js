import {kerrRadius} from './kerr.js?v=6';
export function horizonUVAt(p,mass=1,spin=0,time=0,rotate=false){
 const r=kerrRadius(p,spin*mass),rh=1+Math.sqrt(1-spin*spin),phase=rotate?time*spin/(2*rh*mass):0;
 const u=((Math.atan2(-p[2],p[0])-phase)/(2*Math.PI)+.5)%1;
 const v=Math.acos(Math.max(-1,Math.min(1,p[1]/r)))/Math.PI;
 return {u:(u+1)%1,v,sector:Math.min(7,Math.floor(((u+1)%1)*8)),band:Math.min(3,Math.floor(v*4))};
}
export function createHorizonUVTexture(){
 const c=document.createElement('canvas');c.width=2048;c.height=1024;
 const ctx=c.getContext('2d'),cw=c.width/8,ch=c.height/4;
 for(let row=0;row<4;row++)for(let col=0;col<8;col++){
  const x=col*cw,y=row*ch;ctx.fillStyle=`hsl(${col*43+row*7} 65% ${row<2?57:34}%)`;ctx.fillRect(x,y,cw,ch);
  ctx.strokeStyle='#0b111c';ctx.lineWidth=7;ctx.strokeRect(x,y,cw,ch);ctx.strokeStyle='#fff8dc99';ctx.lineWidth=2;ctx.strokeRect(x+7,y+7,cw-14,ch-14);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fffbed';ctx.strokeStyle='#0b111c';ctx.lineWidth=7;ctx.font='bold 72px sans-serif';const label=String.fromCharCode(65+col)+(row+1);ctx.strokeText(label,x+cw/2,y+ch*.45);ctx.fillText(label,x+cw/2,y+ch*.45);
  ctx.font='bold 24px sans-serif';ctx.lineWidth=4;ctx.strokeText(row<2?'NORTH':'SOUTH',x+cw/2,y+ch*.18);ctx.fillText(row<2?'NORTH':'SOUTH',x+cw/2,y+ch*.18);
  ctx.font='19px monospace';ctx.strokeText('U →   V ↓',x+cw/2,y+ch*.76);ctx.fillText('U →   V ↓',x+cw/2,y+ch*.76);
 }
 return c;
}
export function drawHorizonUVReference(canvas){
 canvas.width=640;canvas.height=320;const ctx=canvas.getContext('2d');ctx.drawImage(createHorizonUVTexture(),0,0,640,320);
}
