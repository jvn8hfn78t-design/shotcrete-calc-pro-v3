import type { Nube, Punto3D } from "./triangulacion";

type XYZ = {x:number; y:number; z:number};
type Foto = {ancho:number; alto:number};
type Pixel = {x:number; y:number};
const vector = (x:number,y:number,z:number):XYZ => ({x,y,z});
const escalar = (p:XYZ,k:number) => vector(p.x*k,p.y*k,p.z*k);
function transformar(p:XYZ,n:Nube,inversa=false) {
  const r=n.rotacion,t=n.traslacion;
  if(inversa) {
    const x=p.x-t[0],y=p.y-t[1],z=p.z-t[2];
    return vector(...([0,1,2].map(i=>r[0][i]*x+r[1][i]*y+r[2][i]*z) as [number,number,number]));
  }
  return vector(...(r.map((fila,i)=>fila[0]*p.x+fila[1]*p.y+fila[2]*p.z+t[i]) as [number,number,number]));
}
function residual(p:XYZ,pixel:Pixel,foto:Foto) {
  if(!(p.z>0)) return Infinity;
  const focal=0.8*Math.max(foto.ancho,foto.alto);
  return Math.hypot(foto.ancho/2+focal*p.x/p.z-pixel.x,foto.alto/2+focal*p.y/p.z-pixel.y);
}
export function unirTres(ab:Nube,bc:Nube,fotos:Foto[]) {
  // Ambas nubes conocen la cámara B. Solo falta relacionar sus líneas base.
  const enlaces:{p:Punto3D;q:Punto3D;enB:XYZ}[]=[];
  const clave=(p:Pixel)=>p.x+","+p.y;
  const enSegunda=new Map(bc.puntos.map(q=>[clave(q.a),q]));
  for(const p of ab.puntos) {
    const q=enSegunda.get(clave(p.b));
    if(q) enlaces.push({p,q,enB:transformar(p,ab)});
  }
  function comprobar(k:number) {
    return enlaces.map(({p,q,enB})=>Math.max(
      residual(enB,p.b,fotos[1]),
      residual(transformar(escalar(enB,1/k),bc),q.b,fotos[2]),
      residual(transformar(escalar(q,k),ab,true),p.a,fotos[0])
    ));
  }
  let escala=0, apoyo=0, coste=Infinity;
  const propuestas=enlaces.map(e=>e.enB.z/e.q.z).filter(k=>k>0 && Number.isFinite(k)).sort((a,b)=>a-b);
  const escalas=propuestas.flatMap((k,i)=>Array.from({length:9},(_,j)=>k+((propuestas[i+1]??k)-k)*j/9));
  for(const k of escalas) {
    if(!Number.isFinite(k)||k<=0) continue;
    const buenos=comprobar(k).filter(e=>e<=3);
    const suma=buenos.reduce((s,e)=>s+e,0);
    if(buenos.length>apoyo || (buenos.length===apoyo && suma<coste)) {
      escala=k; apoyo=buenos.length; coste=suma;
    }
  }

  const errores=comprobar(escala);
  const confirmados=enlaces.filter((_,i)=>errores[i]<=3);
  const separados=confirmados.some((a,i)=>confirmados.slice(i+1).some(b=>Math.hypot(a.p.b.x-b.p.b.x,a.p.b.y-b.p.b.y)>=24));
  const aceptada=separados && apoyo>=Math.max(4,Math.ceil(enlaces.length/2));
  const compartidos=new Set(enlaces.map(e=>e.q));
  const puntos:XYZ[]=[...ab.puntos,...bc.puntos.filter(q=>!compartidos.has(q)).map(q=>transformar(escalar(q,escala),ab,true))];
  return {puntos:aceptada?puntos:[], apoyo, enlaces:enlaces.length};
}
