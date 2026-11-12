import { useMemo, useState } from "react";

type Punto = { x: number; y: number; z: number };
const ANCHO = 4;
const ALTO = 4.2;
const RADIO = ANCHO / 2;
const PARED = ALTO - RADIO;
const LONGITUD = 3.8;
const PASOS = 16;
const ARCOS = 20;

function seccion(angulo: number, z: number): Punto {
  const segmento = angulo * (2 * PARED + Math.PI * RADIO);
  let x: number, y: number;
  if (segmento <= PARED) {
    x = -RADIO; y = segmento;
  } else if (segmento <= PARED + Math.PI * RADIO) {
    const a = Math.PI - (segmento - PARED) / RADIO;
    x = RADIO * Math.cos(a);
    y = PARED + RADIO * Math.sin(a);
  } else {
    x = RADIO;
    y = PARED - (segmento - PARED - Math.PI * RADIO);
  }
  // Pequeñas irregularidades solo para la demostración visual.
  const irregularidad = 0.045 * Math.sin(z * 3.1 + angulo * 19) * Math.sin(angulo * 13 + z * 1.7);
  return { x: x + irregularidad, y: y + irregularidad, z };
}

export function PilotoLabor3D() {
  const [giro, setGiro] = useState(30);
  const [inclinacion, setInclinacion] = useState(18);
  const [zoom, setZoom] = useState(100);
  const [modo, setModo] = useState<"malla" | "puntos">("malla");

  const modelo = useMemo(() => {
    const a = giro * Math.PI / 180;
    const b = inclinacion * Math.PI / 180;
    const proyectar = (p: Punto) => {
      const x = p.x;
      const y = p.y - ALTO / 2;
      const z = p.z - LONGITUD / 2;
      const horizontal = x * Math.cos(a) + z * Math.sin(a);
      const fondo = -x * Math.sin(a) + z * Math.cos(a);
      return {
        x: 180 + horizontal * 43 * zoom / 100,
        y: 155 - (y * Math.cos(b) - fondo * Math.sin(b)) * 43 * zoom / 100,
        fondo: y * Math.sin(b) + fondo * Math.cos(b),
      };
    };
    const vertices = Array.from({ length: PASOS + 1 }, (_, i) =>
      Array.from({ length: ARCOS + 1 }, (_, j) =>
        proyectar(seccion(j / ARCOS, LONGITUD * i / PASOS)),
      ),
    );
    const caras = [];
    for (let i = 0; i < PASOS; i++) {
      for (let j = 0; j < ARCOS; j++) {
        const p = [vertices[i][j], vertices[i + 1][j], vertices[i + 1][j + 1], vertices[i][j + 1]];
        caras.push({
          clave: i + "-" + j,
          puntos: p.map(v => v.x.toFixed(1) + "," + v.y.toFixed(1)).join(" "),
          fondo: p.reduce((s, v) => s + v.fondo, 0) / 4,
          corona: j > 3 && j < ARCOS - 4,
        });
      }
    }
    return { vertices, caras: caras.sort((p, q) => q.fondo - p.fondo) };
  }, [giro, inclinacion, zoom]);

  return <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
    <div>
      <h3 className="font-bold uppercase">Piloto 3D · labor minera simulada</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Modelo de demostración generado matemáticamente. No utiliza tus fotografías ni representa un levantamiento real.
      </p>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setModo("malla")}
        className={`rounded-lg border px-3 py-2 text-sm ${modo === "malla" ? "bg-primary text-primary-foreground" : ""}`}>
        Superficie 3D
      </button>
      <button type="button" onClick={() => setModo("puntos")}
        className={`rounded-lg border px-3 py-2 text-sm ${modo === "puntos" ? "bg-primary text-primary-foreground" : ""}`}>
        Nube de puntos
      </button>
    </div>
    <svg viewBox="0 0 360 310" className="w-full rounded-xl bg-slate-950" role="img"
      aria-label="Modelo simulado tridimensional de galería minera con corona, hastiales y tope">
      <defs>
        <linearGradient id="fondo-piloto" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f172a" />
          <stop offset="1" stopColor="#020617" />
        </linearGradient>
      </defs>
      <rect width="360" height="310" fill="url(#fondo-piloto)" />
      <text x="12" y="22" fill="#e2e8f0" fontSize="12" fontWeight="bold">SIMULACIÓN · NO ES MEDICIÓN REAL</text>
      {modo === "malla"
        ? modelo.caras.map(c => <polygon key={c.clave} points={c.puntos}
            fill={c.corona ? "#14b8a6" : "#64748b"} fillOpacity={0.50}
            stroke="#94a3b8" strokeOpacity={0.36} strokeWidth={0.7} />)
        : modelo.vertices.flatMap((fila, i) => fila.map((p, j) =>
            <circle key={i + "-" + j} cx={p.x} cy={p.y} r={1.8}
              fill={j > 3 && j < ARCOS - 4 ? "#5eead4" : "#cbd5e1"} />))}
      {modelo.vertices[0] && <polyline
        points={modelo.vertices[0].map(p => p.x + "," + p.y).join(" ")}
        fill="none" stroke="#fbbf24" strokeWidth="2" />}
      {modelo.vertices[PASOS] && <polyline
        points={modelo.vertices[PASOS].map(p => p.x + "," + p.y).join(" ")}
        fill="none" stroke="#38bdf8" strokeWidth="2" />}
      <text x="12" y="294" fill="#cbd5e1" fontSize="11">Corona y hastiales · tope señalado en azul</text>
    </svg>
    <div className="grid grid-cols-3 gap-2 text-center text-sm">
      <div className="rounded-lg bg-secondary p-2"><strong>{ANCHO.toFixed(1)} m</strong><p className="text-xs">Ancho</p></div>
      <div className="rounded-lg bg-secondary p-2"><strong>{ALTO.toFixed(1)} m</strong><p className="text-xs">Alto</p></div>
      <div className="rounded-lg bg-secondary p-2"><strong>{LONGITUD.toFixed(1)} m</strong><p className="text-xs">Largo</p></div>
    </div>
    <label className="block text-sm">Giro horizontal · {giro}°
      <input className="block w-full" type="range" min="-180" max="180" value={giro}
        onChange={e => setGiro(Number(e.target.value))} />
    </label>
    <label className="block text-sm">Inclinación · {inclinacion}°
      <input className="block w-full" type="range" min="-65" max="65" value={inclinacion}
        onChange={e => setInclinacion(Number(e.target.value))} />
    </label>
    <label className="block text-sm">Acercamiento · {zoom}%
      <input className="block w-full" type="range" min="50" max="170" step="10" value={zoom}
        onChange={e => setZoom(Number(e.target.value))} />
    </label>
    <button type="button" className="rounded-lg border px-3 py-2 text-sm"
      onClick={() => { setGiro(30); setInclinacion(18); setZoom(100); }}>
      Restablecer vista
    </button>
    <p className="text-xs text-muted-foreground">
      Demostración visual offline. La superficie del tope se señala por su contorno;
      todavía no existe malla cerrada ni cubicación fotogramétrica validada.
    </p>
  </section>;
}
