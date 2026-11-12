import { useMemo, useRef, useState } from "react";

type Punto = { x: number; y: number; z: number };
type Proyectado = { x: number; y: number; profundidad: number };

export function PilotoLabor3D({ ancho = 4, alto = 4.2, longitud = 3.8 }: { ancho?: number; alto?: number; longitud?: number }) {
  const A = Math.max(0.5, ancho);
  const H = Math.max(A / 2, alto);
  const L = Math.max(0.1, longitud);
  const [giro, setGiro] = useState(34);
  const [inclinacion, setInclinacion] = useState(18);
  const [zoom, setZoom] = useState(1);
  const arrastre = useRef<{ x: number; y: number; giro: number; inclinacion: number } | null>(null);
  const radio = A / 2;
  const pared = H - radio;
  const arco = 28;
  const pasos = 16;

  const geometria = useMemo(() => {
    const perfil = (t: number, z: number): Punto => {
      const distancia = t * (2 * pared + Math.PI * radio);
      if (distancia <= pared) return { x: -radio, y: distancia, z };
      if (distancia <= pared + Math.PI * radio) {
        const ang = Math.PI - (distancia - pared) / radio;
        return { x: radio * Math.cos(ang), y: pared + radio * Math.sin(ang), z };
      }
      return { x: radio, y: pared - (distancia - pared - Math.PI * radio), z };
    };
    const yaw = giro * Math.PI / 180;
    const pitch = inclinacion * Math.PI / 180;
    const escala = 185 / Math.max(A, H, L, 3) * zoom;
    const proyectar = (p: Punto): Proyectado => {
      const x = p.x;
      const y = p.y - H / 2;
      const z = p.z - L / 2;
      const horizontal = x * Math.cos(yaw) + z * Math.sin(yaw);
      const profundidad = -x * Math.sin(yaw) + z * Math.cos(yaw);
      return {
        x: 210 + horizontal * escala,
        y: 180 - (y * Math.cos(pitch) - profundidad * Math.sin(pitch)) * escala,
        profundidad: y * Math.sin(pitch) + profundidad * Math.cos(pitch),
      };
    };
    const filas = Array.from({ length: pasos + 1 }, (_, i) =>
      Array.from({ length: arco + 1 }, (_, j) => proyectar(perfil(j / arco, L * i / pasos)))
    );
    const caras: { key: string; puntos: string; profundidad: number; fill: string }[] = [];
    const agregar = (key: string, pts: Proyectado[], fill: string) => {
      caras.push({
        key, puntos: pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "),
        profundidad: pts.reduce((n, p) => n + p.profundidad, 0) / pts.length, fill,
      });
    };
    for (let i = 0; i < pasos; i++) {
      for (let j = 0; j < arco; j++) {
        const p = [filas[i][j], filas[i + 1][j], filas[i + 1][j + 1], filas[i][j + 1]];
        const tono = 44 + Math.round(9 * Math.sin(i * 0.9 + j * 0.7));
        agregar(`pared-${i}-${j}`, p, `hsl(194 14% ${tono}%)`);
      }
    }
    // Tope sólido: abanico triangular que cierra el extremo de la labor.
    const centro = proyectar({ x: 0, y: H / 2, z: L });
    for (let j = 0; j < arco; j++) {
      agregar(`tope-${j}`, [centro, filas[pasos][j], filas[pasos][j + 1]], j % 2 ? "#8d969b" : "#879196");
    }
    // Piso, también cerrado, desde la entrada hasta el tope.
    agregar("piso", [
      proyectar({ x: -radio, y: 0, z: 0 }), proyectar({ x: radio, y: 0, z: 0 }),
      proyectar({ x: radio, y: 0, z: L }), proyectar({ x: -radio, y: 0, z: L }),
    ], "#525f62");
    return caras.sort((a, b) => b.profundidad - a.profundidad);
  }, [A, H, L, giro, inclinacion, zoom, pared, radio]);

  return <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
    <div>
      <h3 className="font-bold uppercase">Vista 3D de la labor</h3>
      <p className="mt-1 text-xs text-muted-foreground">Modelo geométrico referencial según tus medidas; no es un escaneo fotogramétrico.</p>
    </div>
    <div className="overflow-hidden rounded-xl bg-slate-950">
      <svg viewBox="0 0 420 360" className="block w-full cursor-grab touch-none active:cursor-grabbing" role="img"
        aria-label="Visor tridimensional de la labor con corona, hastiales, piso y tope. Arrastra para girar."
        onPointerDown={e => {
          arrastre.current = { x: e.clientX, y: e.clientY, giro, inclinacion };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if (!arrastre.current) return;
          const d = arrastre.current;
          setGiro(d.giro + (e.clientX - d.x) * 0.45);
          setInclinacion(Math.max(-80, Math.min(80, d.inclinacion + (e.clientY - d.y) * 0.3)));
        }}
        onPointerUp={e => {
          arrastre.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => { arrastre.current = null; }}
      >
        <defs><radialGradient id="fondo-labor"><stop stopColor="#263a48"/><stop offset="1" stopColor="#07111c"/></radialGradient></defs>
        <rect width="420" height="360" fill="url(#fondo-labor)" />
        {geometria.map(c => <polygon key={c.key} points={c.puntos} fill={c.fill} />)}
        <text x="12" y="24" fill="#e2e8f0" fontSize="12" fontWeight="bold">MODELO REFERENCIAL · ARRASTRA PARA GIRAR</text>
        <text x="12" y="342" fill="#cbd5e1" fontSize="11">Corona · hastiales · piso · tope</text>
      </svg>
    </div>
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-lg bg-secondary p-2"><strong>{A.toFixed(2)} m</strong><p className="text-xs">Ancho</p></div>
      <div className="rounded-lg bg-secondary p-2"><strong>{H.toFixed(2)} m</strong><p className="text-xs">Alto</p></div>
      <div className="rounded-lg bg-secondary p-2"><strong>{L.toFixed(2)} m</strong><p className="text-xs">Avance</p></div>
    </div>
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => setZoom(v => Math.max(0.5, v - 0.15))} className="rounded-lg border px-4 py-2 font-bold">−</button>
      <span className="text-xs text-muted-foreground">Acercar / alejar</span>
      <button type="button" onClick={() => setZoom(v => Math.min(2.2, v + 0.15))} className="rounded-lg border px-4 py-2 font-bold">+</button>
      <button type="button" onClick={() => { setGiro(34); setInclinacion(18); setZoom(1); }} className="rounded-lg border px-3 py-2 text-xs">Restablecer</button>
    </div>
    <p className="text-xs text-muted-foreground">La sección se representa con bóveda semicircular y paredes verticales. El tope está cerrado. Esta geometría es ilustrativa y no modifica los cálculos de shotcrete.</p>
  </section>;
}
