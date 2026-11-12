import { useEffect, useRef, useState } from "react";
import Comparador from "../lib/correspondencias.worker?worker&inline";
import { leerFoto } from "./PreparacionFotografias";

type Foto = { id: string; file: Blob; preview: string };
type Punto = { x: number; y: number };
type Par = { a: Punto; b: Punto };

type Resultado = { i:number; j:number; pares:Par[]; candidatos:number };
type Tamano = { ancho:number; alto:number };

function procesar<T>(worker:Worker, orden:unknown, signal:AbortSignal, transfer:Transferable[]=[]):Promise<T> {
  return new Promise((resolve,reject) => {
    signal.throwIfAborted();
    const terminar=() => {
      clearTimeout(timer);
      signal.removeEventListener("abort",abortar);
      worker.onmessage=null;
      worker.onerror=null;
      worker.onmessageerror=null;
    };
    const fallar=(mensaje:string) => { terminar(); reject(new Error(mensaje)); };
    const abortar=() => fallar("Análisis cancelado.");
    const timer=window.setTimeout(()=>fallar("El procesamiento superó un minuto por operación."),60000);
    signal.addEventListener("abort",abortar,{once:true});
    worker.onmessage=e=>{ terminar(); resolve(e.data as T); };
    worker.onerror=worker.onmessageerror=()=>fallar("No se pudo procesar este recorrido.");
    try { worker.postMessage(orden,transfer); }
    catch (error) { terminar(); reject(error); }
  });
}

export function CorrespondenciasFotos({ fotos }: { fotos: Foto[] }) {
  const [mensaje,setMensaje]=useState("");
  const [ocupado,setOcupado]=useState(false);
  const [lista,setLista]=useState<Resultado[]>([]);
  const [indice,setIndice]=useState(0);
  const [tamanos,setTamanos]=useState<Tamano[]>([]);
  const tarea=useRef<AbortController|null>(null);
  useEffect(()=>()=>{ tarea.current?.abort(); },[]);
  async function comparar() {
    if (tarea.current || fotos.length<2) return;
    const control=new AbortController();
    tarea.current=control;
    setOcupado(true); setLista([]); setIndice(0);
    let worker:Worker|undefined;
    try {
      worker=new Comparador();
      const medidas:Tamano[]=[];
      for (let i=0;i<fotos.length;i++) {
        setMensaje(`Preparando foto ${i+1} de ${fotos.length}…`);
        const t=await leerFoto(fotos[i].file);
        control.signal.throwIfAborted();
        medidas.push({ancho:t.ancho,alto:t.alto});
        await procesar(worker,{tipo:"foto",indice:i,trama:t},control.signal,[t.datos.buffer]);
      }
      const total=fotos.length*(fotos.length-1)/2;
      const resultados:Resultado[]=[];
      let hechos=0;
      for (let i=0;i<fotos.length;i++) {
        for (let j=i+1;j<fotos.length;j++) {
          setMensaje(`Comparando par ${++hechos} de ${total}…`);
          const r=await procesar<Resultado>(worker,{tipo:"comparar",i,j},control.signal);
          if (r.pares.length) resultados.push(r);
        }
      }
      resultados.sort((a,b)=>b.pares.length-a.pares.length);
      setTamanos(medidas); setLista(resultados);
      setMensaje(`${resultados.length} de ${total} pares de fotos con al menos cinco puntos compatibles.`);
    } catch (error) {
      if (!control.signal.aborted) setMensaje(error instanceof Error ? error.message : "Error al analizar las fotos.");
    } finally {
      worker?.terminate();
      tarea.current=null;
      if (!control.signal.aborted) setOcupado(false);
    }
  }
  const resultado=lista[indice];
  const visibles=resultado?.pares.filter((_,i,pares)=>i%Math.max(1,Math.ceil(pares.length/16))===0) ?? [];
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="font-bold uppercase">Puntos comunes del recorrido</h3>
      <button type="button" disabled={ocupado || fotos.length<2} onClick={()=>void comparar()}
        className="h-12 w-full rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">
        {ocupado ? "ANALIZANDO..." : "ANALIZAR RECORRIDO"}
      </button>
      <p role="status" className="text-sm">{fotos.length<2 ? "Agrega dos fotografías de recorrido." : mensaje}</p>
      {resultado && <label className="block text-sm">Par de fotos
        <select className="block w-full rounded-lg border bg-background p-2" value={indice} onChange={e=>setIndice(Number(e.target.value))}>
          {lista.map((r,k)=><option key={r.i+"-"+r.j} value={k}>Fotos {r.i+1} y {r.j+1} · {r.pares.length} puntos</option>)}
        </select>
      </label>}
      {resultado && [resultado.i,resultado.j].map((numero,i) => {
        const foto=fotos[numero];
        const { ancho,alto }=tamanos[numero];
        return (
        <figure key={foto.id}>
          <figcaption>Recorrido · Foto {numero+1}</figcaption>
          <svg viewBox={`0 0 ${ancho} ${alto}`} className="block h-auto w-full rounded-lg" role="img" aria-label={`Foto ${numero+1} con puntos comunes`}>
            <image href={foto.preview} width={ancho} height={alto} />
            {visibles.map((par, j) => {
              const p = i === 0 ? par.a : par.b;
              return <g key={j}>
                <circle cx={p.x} cy={p.y} r={4} fill="none" stroke="#00ff80" strokeWidth={2} />
                <text x={p.x + 5} y={Math.max(14, p.y - 4)} fill="white" stroke="black"
                  strokeWidth={3} paintOrder="stroke" fontSize={14} fontWeight="bold">{j + 1}</text>
              </g>;
            })}
          </svg>
        </figure>
      ); })}
    </section>
  );
}
