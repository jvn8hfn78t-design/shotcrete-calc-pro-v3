import { useState } from "react";
import type { Nube } from "../lib/triangulacion";

export function VistaNube({ nube, indice, seleccionar }: {
  nube:Nube; indice:number; seleccionar:(i:number)=>void;
}) {
  const [giro,setGiro]=useState(0);
  const puntos=nube.puntos;
  const rad=giro*Math.PI/180;
  const media=(campo:"x"|"y"|"z")=>puntos.reduce((s,p)=>s+p[campo],0)/puntos.length;
  const cx=media("x"),cy=media("y"),cz=media("z");
  const radio=Math.max(0.001,...puntos.map(p=>Math.hypot(p.x-cx,p.y-cy,p.z-cz)));
  const escala=110/radio;
  return <section className="space-y-2 rounded-lg border p-3">
    <h4 className="font-bold">Nube 3D experimental · {puntos.length} puntos</h4>
    <p className="text-sm">Escala relativa y focal estimada. Error mediano en la segunda foto: {nube.errorMediano.toFixed(2)} px.</p>
    <svg viewBox="0 0 300 240" className="w-full rounded bg-slate-950" aria-label="Nube de puntos con giro horizontal" role="img">
      {puntos.map((p,i)=><circle key={i} onClick={()=>seleccionar(i)}
        cx={150+escala*((p.x-cx)*Math.cos(rad)+(p.z-cz)*Math.sin(rad))}
        cy={120+escala*(p.y-cy)} r={i===indice?5:3} fill={i===indice?"#fbbf24":"#5eead4"} />)}
    </svg>
    <label className="block">Girar vista · {giro}°
      <input className="block w-full" type="range" min="-180" max="180" value={giro} onChange={e=>setGiro(Number(e.target.value))}/>
    </label>
    <label className="block">Punto a identificar en ambas fotos · {indice+1} de {puntos.length}
      <input className="block w-full" type="range" min="0" max={puntos.length-1} value={indice}
        onChange={e=>seleccionar(Number(e.target.value))}/>
    </label>
    <p className="text-xs">El círculo amarillo ubica el punto elegido en las dos fotografías.</p>
  </section>;
}
