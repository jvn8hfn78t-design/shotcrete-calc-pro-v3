import { useMemo, useState } from "react";
import type { Nube } from "../lib/triangulacion";
import { unirTres } from "../lib/union-tres-vistas";

type Par = { i:number; j:number; geometria:{ nube?:Nube } };
function invertir(n:Nube):Nube {
  const r=n.rotacion,t=n.traslacion;
  const inversa=r[0].map((_,i)=>r.map(fila=>fila[i]));
  const trasladar=(fila:number[])=>-(fila[0]*t[0]+fila[1]*t[1]+fila[2]*t[2]);
  const puntos=n.puntos.map(p=>{
    const [x,y,z]=r.map((fila,i)=>fila[0]*p.x+fila[1]*p.y+fila[2]*p.z+t[i]);
    return {...p,x,y,z,a:p.b,b:p.a};
  });
  return {...n,puntos,rotacion:inversa,traslacion:inversa.map(trasladar) as [number,number,number]};
}

function encadenar(nubes:Par[]) {
  const orientados=nubes.flatMap(p=>[
    {i:p.i,j:p.j,n:p.geometria.nube!,invertida:false},
    {i:p.j,j:p.i,n:p.geometria.nube!,invertida:true},
  ]);
  const porInicio=new Map<number,typeof orientados>();
  for(const p of orientados) {
    const grupo=porInicio.get(p.i)??[];
    grupo.push(p); porInicio.set(p.i,grupo);
  }
  return orientados.flatMap(ab=>(porInicio.get(ab.j)??[])
    .filter(bc=>ab.i<bc.j).map(bc=>({ab,bc})));
}
export function UnionTresVistas({lista,medidas}:{lista:Par[];medidas:{ancho:number;alto:number}[]}) {
  const [indice,elegir]=useState(0);
  const [resultado,mostrar]=useState<ReturnType<typeof unirTres>|null>(null);
  const [giro,girar]=useState(0);
  const nubes=useMemo(()=>lista.filter(p=>p.geometria.nube),[lista]);
  const cadenas=useMemo(()=>encadenar(nubes),[nubes]);
  const cadena=cadenas[indice];
  const puntos=resultado?.puntos??[];
  const centro=(campo:"x"|"y"|"z")=>puntos.reduce((s,p)=>s+p[campo],0)/Math.max(1,puntos.length);
  const x=centro("x"),y=centro("y"),z=centro("z");
  const escala=105/Math.max(0.001,...puntos.map(p=>Math.hypot(p.x-x,p.y-y,p.z-z)));
  const rad=giro*Math.PI/180;
  return <section className="space-y-2 rounded-lg border p-3">
    <h4 className="font-bold">Unión de tres vistas</h4>
    {cadena ? <>
      <label className="block">Fotos del recorrido
        <select className="block w-full rounded border bg-background p-2" value={indice} onChange={e=>{elegir(Number(e.target.value));mostrar(null);girar(0);}}>
          {cadenas.map(({ab,bc},i)=><option key={[ab.i,ab.j,bc.j].join("-")} value={i}>{[ab.i+1,ab.j+1,bc.j+1].join(" · ")}</option>)}
        </select>
      </label>
      <button type="button" className="rounded border px-3 py-2" onClick={()=>{
        const {ab,bc}=cadena;
        mostrar(unirTres(ab.invertida?invertir(ab.n):ab.n,bc.invertida?invertir(bc.n):bc.n,[medidas[ab.i],medidas[ab.j],medidas[bc.j]]));
      }}>Comprobar unión</button>
    </> : <p>{nubes.length===0 ? "Este análisis produjo 0 nubes. Revisa el conteo de paralaje en el resumen." :
        nubes.length===1 ? "Solo se obtuvo una nube. Para unirla hace falta otro par con nube que incluya una de esas dos fotos." :
        "Las nubes obtenidas corresponden a pares sin una foto en común."}
        {nubes.length>0 && <> Pares con nube: {nubes.map(p=>(p.i+1)+"–"+(p.j+1)).join(", ")}.</>}</p>}
    {resultado && <p role="status">{resultado.apoyo} de {resultado.enlaces} puntos compartidos pasan el control de 3 píxeles.
      {puntos.length ? ` Nube unida: ${puntos.length} puntos en escala relativa.` : " Apoyo insuficiente para unir las nubes."}</p>}
    {puntos.length>0 && <>
      <svg viewBox="0 0 300 240" role="img" aria-label="Nube de tres vistas" className="block w-full rounded bg-slate-950">
      {puntos.map((p,i)=><circle key={i} cx={150+escala*((p.x-x)*Math.cos(rad)+(p.z-z)*Math.sin(rad))} cy={120+escala*(p.y-y)} r={3} fill="#5eead4"/>)}
      </svg>
      <label>Girar nube unida · {giro}°<input type="range" className="w-full" min="-180" max="180" value={giro} onChange={e=>girar(Number(e.target.value))}/></label>
    </>}
  </section>;
}
