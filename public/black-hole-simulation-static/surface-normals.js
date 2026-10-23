import {kerrRadius} from './kerr.js?v=6';
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);

// Euclidean coordinate-space normals for debug annotation, not spacetime
// four-normals or vectors parallel-transported through the lens.
export function surfaceNormalForHit(hit,mass=1,spin=0){
 if(hit?.kind==='disk')return hit.face==='BOTTOM'?[0,-1,0]:[0,1,0];
 if(hit?.kind!=='horizon'||!hit.position?.every(Number.isFinite))return null;
 const p=hit.position,a=spin*mass,r=kerrRadius(p,a),r2=r*r;
 if(r2<1e-16||Math.hypot(...p)<1e-12)return null;
 // Constant-r oblate surfaces: (x²+z²)/(r²+a²) + y²/r² = 1.
 const gradient=[p[0]/(r2+a*a),p[1]/r2,p[2]/(r2+a*a)],length=Math.hypot(...gradient);
 return gradient.map(value=>value/length);
}

export function projectNormal(normal,basis,length=52){
 return {dx:length*dot(normal,basis.right),dy:-length*dot(normal,basis.up),towardCamera:-dot(normal,basis.forward)};
}
