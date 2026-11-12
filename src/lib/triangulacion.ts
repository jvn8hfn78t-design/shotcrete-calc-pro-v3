type V = [number,number,number];
type Pixel = {x:number;y:number};
type Par = {a:Pixel;b:Pixel};
export type Punto3D = { x:number;y:number;z:number; a:Pixel;b:Pixel; error:number };
type Camara = {ancho:number;alto:number};
export type Nube = { puntos:Punto3D[]; errorMediano:number; rotacion:number[][]; traslacion:V };
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a:V,k:number):V=>[a[0]*k,a[1]*k,a[2]*k];
const normal=(a:V)=>scale(a,1/Math.hypot(...a));
const plus=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
// Focal aproximada en píxeles del fotograma reducido; la línea base define la unidad.
const focal=(c:Camara)=>0.8*Math.max(c.ancho,c.alto);
const rayo=(p:Pixel,c:Camara):V=>[(p.x-c.ancho/2)/focal(c),(p.y-c.alto/2)/focal(c),1];

export function triangular(pares:Par[],h:number[],e:V,c1:Camara,c2:Camara):Nube|null {
  const t=normal([(e[0]-e[2]*c2.ancho/2)/focal(c2),(e[1]-e[2]*c2.alto/2)/focal(c2),e[2]]);
  const u=normal(cross(t,Math.abs(t[2])<0.9?[0,0,1]:[1,0,0])),v=cross(t,u);
  // H procede del ajuste en coordenadas divididas por 512. En el plano
  // perpendicular a t, el término de traslación de la homografía desaparece.
  function columna(x:number,y:number,z:number):V {
    const a=(focal(c1)*x+c1.ancho/2*z)/512,b=(focal(c1)*y+c1.alto/2*z)/512;
    const w=h[6]*a+h[7]*b+z;
    return [(512*(h[0]*a+h[1]*b+h[2]*z)-c2.ancho/2*w)/focal(c2),
            (512*(h[3]*a+h[4]*b+h[5]*z)-c2.alto/2*w)/focal(c2),w];
  }
  const cols=[columna(1,0,0),columna(0,1,0),columna(0,0,1)];
  const a=cols.map(c=>dot(u,c)) as V,b=cols.map(c=>dot(v,c)) as V;
  // Factor polar de las dos filas para obtener una rotación ortonormal.
  const aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),d=Math.sqrt(Math.max(0,aa*bb-ab*ab));
  if (!(d>1e-10)) return null;
  const k=1/(d*Math.sqrt(aa+bb+2*d));
  const ru=scale(plus(scale(a,bb+d),scale(b,-ab)),k);
  const rv=scale(plus(scale(b,aa+d),scale(a,-ab)),k),rt=cross(ru,rv);
  let mejor:Nube|null=null;
  for(const signo of [1,-1]) for(const sentido of [1,-1]) {
    const R=[0,1,2].map(i=>plus(plus(scale(ru,signo*u[i]),scale(rv,signo*v[i])),scale(rt,t[i])));
    const T=scale(t,sentido), puntos:Punto3D[]=[];
    for(const par of pares) {
      const x=normal(rayo(par.a,c1)),y=normal(rayo(par.b,c2));
      const rx=R.map(f=>dot(f,x)) as V;
      const cos=dot(rx,y),den=1-cos*cos;
      if(den<0.0003) continue; // rayos casi paralelos: profundidad inestable
      const profundidad=(cos*dot(y,T)-dot(rx,T))/den;
      const P=scale(x,profundidad),Q=plus(scale(rx,profundidad),T);
      if(!(P[2]>0 && Q[2]>0)) continue;
      const error=Math.hypot(c2.ancho/2+focal(c2)*Q[0]/Q[2]-par.b.x,c2.alto/2+focal(c2)*Q[1]/Q[2]-par.b.y);
      if(error<=2.5) puntos.push({x:P[0],y:P[1],z:P[2],...par,error});
    }
    if(puntos.length<8) continue;
    const errores=puntos.map(p=>p.error).sort((a,b)=>a-b);
    const errorMediano=errores[Math.floor(errores.length/2)];
    if(!mejor || puntos.length>mejor.puntos.length || (puntos.length===mejor.puntos.length && errorMediano<mejor.errorMediano))
      mejor={puntos,rotacion:R,traslacion:T,errorMediano};
  }
  return mejor;
}
