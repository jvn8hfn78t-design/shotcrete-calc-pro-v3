import { useEffect, useRef, useState } from "react";
import Comparador from "../lib/correspondencias.worker?worker&inline";
import { leerFoto } from "./PreparacionFotografias";

type Foto = { id: string; file: Blob; preview: string };
type Punto = { x: number; y: number };
type Par = { a: Punto; b: Punto };

export function CorrespondenciasFotos({ fotos }: { fotos: Foto[] }) {
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ ancho: number; alto: number; pares: Par[] } | null>(null);
  const activo = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    activo.current = true;
    return () => {
      activo.current = false;
      window.clearTimeout(timer.current);
      workerRef.current?.terminate();
    };
  }, []);

  async function comparar() {
    if (ocupado || fotos.length < 2) return;
    setOcupado(true);
    setResultado(null);
    setMensaje("Leyendo las fotografías...");
    function terminar(texto: string) {
      window.clearTimeout(timer.current);
      workerRef.current?.terminate();
      workerRef.current = null;
      if (activo.current) {
        setMensaje(texto);
        setOcupado(false);
      }
    }
    try {
      const primera = await leerFoto(fotos[0].file);
      if (!activo.current) return;
      const segunda = await leerFoto(fotos[1].file);
      if (!activo.current) return;
      if (primera.ancho !== segunda.ancho || primera.alto !== segunda.alto)
        throw new Error("Usa dos fotos con la misma orientación y proporción.");
      const worker = new Comparador();
      workerRef.current = worker;
      setMensaje("Buscando puntos comunes...");
      worker.onmessage = (event: MessageEvent<{ pares: Par[]; escala: number; candidatos: number; detallesA: number; detallesB: number }>) => {
        if (!activo.current) return;
        const { pares, escala, candidatos, detallesA, detallesB } = event.data;
        setResultado({ ancho: primera.ancho, alto: primera.alto, pares });
        terminar(pares.length
          ? `${pares.length} coincidencias candidatas${escala === 2 ? " en la vista reducida" : ""}. Compara los números en ambas fotos.`
          : `Detalles detectados: foto 1: ${detallesA}, foto 2: ${detallesB}. Pares aceptados en la primera pasada: ${candidatos}. Se necesitan al menos 3 en una misma pasada.`);
      };
      worker.onerror = worker.onmessageerror = () => terminar("No se pudo completar la comparación.");
      timer.current = window.setTimeout(() => terminar("La comparación superó un minuto. Puedes reintentar."), 60000);
      worker.postMessage({ primera, segunda }, [primera.datos.buffer, segunda.datos.buffer]);
    } catch (error) {
      terminar(error instanceof Error ? error.message : "No se pudo leer el par.");
    }
  }

  const visibles = resultado?.pares.filter((_, i, pares) =>
    i % Math.max(1, Math.ceil(pares.length / 16)) === 0
  ) ?? [];
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="font-bold uppercase">Puntos comunes del recorrido</h3>
      <p className="text-sm text-muted-foreground">Compara las dos primeras fotos de recorrido en el orden del levantamiento.</p>
      <button type="button" disabled={ocupado || fotos.length < 2} onClick={() => void comparar()}
        className="h-12 w-full rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">
        {ocupado ? "COMPARANDO..." : "COMPARAR DOS FOTOS"}
      </button>
      <p role="status" className="text-sm">{fotos.length < 2 ? "Agrega dos fotografías de recorrido." : mensaje}</p>
      {resultado && fotos.map((foto, i) => (
        <figure key={foto.id}>
          <figcaption>Recorrido · Foto {i + 1}</figcaption>
          <svg viewBox={`0 0 ${resultado.ancho} ${resultado.alto}`} className="block h-auto w-full rounded-lg"
            role="img" aria-label={`Coincidencias en la foto ${i + 1}`}>
            <image href={foto.preview} width={resultado.ancho} height={resultado.alto} />
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
      ))}
    </section>
  );
}
