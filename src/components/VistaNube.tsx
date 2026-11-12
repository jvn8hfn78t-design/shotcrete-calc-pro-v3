import { useMemo, useState } from "react";
import type { Nube } from "../lib/triangulacion";

export function VistaNube({ nube, indice, seleccionar }: {
  nube: Nube;
  indice: number;
  seleccionar: (i: number) => void;
}) {
  const [giro, setGiro] = useState(0);
  const [inclinacion, setInclinacion] = useState(20);
  const [zoom, setZoom] = useState(100);
  const puntos = nube.puntos;

  const proyeccion = useMemo(() => {
    if (!puntos.length) return [];
    const cx = puntos.reduce((s, p) => s + p.x, 0) / puntos.length;
    const cy = puntos.reduce((s, p) => s + p.y, 0) / puntos.length;
    const cz = puntos.reduce((s, p) => s + p.z, 0) / puntos.length;
    const radio = Math.max(
      0.001,
      ...puntos.map(p => Math.hypot(p.x - cx, p.y - cy, p.z - cz)),
    );
    const escala = 105 * zoom / (100 * radio);
    const a = giro * Math.PI / 180;
    const b = inclinacion * Math.PI / 180;
    return puntos.map((p, i) => {
      const x = p.x - cx, y = p.y - cy, z = p.z - cz;
      const horizontal = x * Math.cos(a) + z * Math.sin(a);
      const profundidad = -x * Math.sin(a) + z * Math.cos(a);
      const vertical = y * Math.cos(b) - profundidad * Math.sin(b);
      const fondo = y * Math.sin(b) + profundidad * Math.cos(b);
      return {
        i,
        x: 160 + escala * horizontal,
        y: 125 + escala * vertical,
        fondo,
      };
    }).sort((a, b) => b.fondo - a.fondo);
  }, [puntos, giro, inclinacion, zoom]);

  return <section className="space-y-3 rounded-lg border p-3">
    <h4 className="font-bold">Visor 3D piloto · {puntos.length} puntos</h4>
    <p className="text-sm">
      Nube reconstruida de dos fotografías. Escala relativa, sin dimensiones reales.
      Error mediano de reproyección: {nube.errorMediano.toFixed(2)} px.
    </p>
    <svg
      viewBox="0 0 320 250"
      className="block w-full rounded-lg bg-slate-950"
      role="img"
      aria-label="Visor de nube tridimensional con giro, inclinación y acercamiento"
    >
      <line x1="160" y1="0" x2="160" y2="250" stroke="#334155" strokeDasharray="3 5" />
      <line x1="0" y1="125" x2="320" y2="125" stroke="#334155" strokeDasharray="3 5" />
      {proyeccion.map(p => <circle
        key={p.i}
        cx={p.x}
        cy={p.y}
        r={p.i === indice ? 5.5 : 3}
        fill={p.i === indice ? "#fbbf24" : "#5eead4"}
        stroke={p.i === indice ? "#ffffff" : "none"}
        strokeWidth={1.5}
        onClick={() => seleccionar(p.i)}
      />)}
      <text x="10" y="18" fontSize="11" fill="#cbd5e1">Vista 3D · escala relativa</text>
    </svg>
    <label className="block text-sm">
      Giro horizontal · {giro}°
      <input className="block w-full" type="range" min="-180" max="180" value={giro}
        onChange={e => setGiro(Number(e.target.value))} />
    </label>
    <label className="block text-sm">
      Inclinación · {inclinacion}°
      <input className="block w-full" type="range" min="-90" max="90" value={inclinacion}
        onChange={e => setInclinacion(Number(e.target.value))} />
    </label>
    <label className="block text-sm">
      Acercamiento · {zoom}%
      <input className="block w-full" type="range" min="40" max="250" step="10" value={zoom}
        onChange={e => setZoom(Number(e.target.value))} />
    </label>
    <button type="button" className="rounded border px-3 py-2 text-sm"
      onClick={() => { setGiro(0); setInclinacion(20); setZoom(100); }}>
      Restablecer vista
    </button>
    {puntos.length > 0 && <label className="block text-sm">
      Punto seleccionado · {Math.min(indice + 1, puntos.length)} de {puntos.length}
      <input className="block w-full" type="range" min="0" max={puntos.length - 1}
        value={Math.min(indice, puntos.length - 1)}
        onChange={e => seleccionar(Number(e.target.value))} />
    </label>}
    <p className="text-xs">
      El punto amarillo se identifica también en las dos fotografías originales.
      Este visor es experimental y todavía no permite cubicación.
    </p>
  </section>;
}
