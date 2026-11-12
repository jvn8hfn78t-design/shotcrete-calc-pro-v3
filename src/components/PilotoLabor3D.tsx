import { useMemo, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

type Point = { x: number; y: number; z: number };
type Projected = { x: number; y: number; depth: number };
type Surface = "izquierdo" | "corona" | "derecho" | "tope";
type Face = { id: string; points: string; depth: number; color: string; surface: Surface; stroke?: string };

const hash = (a: number, b: number, c: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

export function PilotoLabor3D({
  ancho = 4, alto = 4.2, longitud = 3.8,
}: { ancho?: number; alto?: number; longitud?: number }) {
  const A = Math.max(0.5, ancho);
  const H = Math.max(A / 2, alto);
  const L = Math.max(0.1, longitud);
  const [yaw, setYaw] = useState(17);
  const [pitch, setPitch] = useState(10);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<Surface | null>(null);
  const dragging = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  const faces = useMemo(() => {
    const r = A / 2;
    const wall = H - r;
    const n = 36;
    const steps = 24;
    const profile = (t: number, z: number, roughness = 0): Point => {
      const distance = t * (2 * wall + Math.PI * r);
      let x: number, y: number;
      if (distance <= wall) { x = -r; y = distance; }
      else if (distance <= wall + Math.PI * r) {
        const angle = Math.PI - (distance - wall) / r;
        x = r * Math.cos(angle);
        y = wall + r * Math.sin(angle);
      } else { x = r; y = wall - (distance - wall - Math.PI * r); }
      // Micro-relieve determinista: superficie de roca, no geometría topográfica medida.
      const jitter = roughness * Math.min(A, H) * (hash(Math.round(t * n), Math.round(z / L * steps), 3) - 0.5);
      const nx = x < 0 ? -1 : 1;
      return { x: x + jitter * nx, y: y + jitter * 0.45, z };
    };

    const yr = yaw * Math.PI / 180;
    const pr = pitch * Math.PI / 180;
    const scale = 174 / Math.max(A, H, L, 3) * zoom;
    const project = (p: Point): Projected => {
      const x = p.x, y = p.y - H * 0.49, z = p.z - L * 0.5;
      const horizontal = x * Math.cos(yr) + z * Math.sin(yr);
      const depth = -x * Math.sin(yr) + z * Math.cos(yr);
      return {
        x: 210 + horizontal * scale,
        y: 189 - (y * Math.cos(pr) - depth * Math.sin(pr)) * scale,
        depth: y * Math.sin(pr) + depth * Math.cos(pr),
      };
    };

    const rows = Array.from({ length: steps + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => project(profile(j / n, i * L / steps, 0.045)))
    );
    const result: Face[] = [];
    const add = (id: string, points: Projected[], color: string, surface: Surface, stroke?: string) => {
      result.push({
        id, points: points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
        depth: points.reduce((sum, p) => sum + p.depth, 0) / points.length, color, surface, stroke,
      });
    };

    // Únicamente las superficies donde se aplica shotcrete: dos hastiales y corona.
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < n; j++) {
        const grain = hash(i, j, 1);
        const crown = j / n > wall / (2 * wall + Math.PI * r) &&
          j / n < (wall + Math.PI * r) / (2 * wall + Math.PI * r);
        const surface: Surface = crown ? "corona" : j < n / 2 ? "izquierdo" : "derecho";
        const base = crown ? 44 : surface === "izquierdo" ? 37 : 32;
        const light = base + Math.round(grain * 16) + (j < n / 2 ? 2 : -1);
        const color = `hsl(${crown ? 35 : 28} ${crown ? 17 : 12}% ${light}%)`;
        add(`rock-${i}-${j}`,
          [rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]],
          color, surface, "rgba(15,17,18,0.16)");
      }
    }

    // Tope completo con pequeñas facetas rocosas: no es una superficie plana artificial.
    const center = project({ x: 0, y: H * 0.49, z: L });
    const inner = Array.from({ length: n + 1 }, (_, j) => {
      const p = profile(j / n, L, 0.045);
      return project({
        x: p.x * 0.52 + (hash(j, 0, 8) - 0.5) * A * 0.045,
        y: H * 0.49 + (p.y - H * 0.49) * 0.52,
        z: L + (hash(j, 0, 9) - 0.5) * L * 0.018,
      });
    });
    for (let j = 0; j < n; j++) {
      const light = 33 + Math.round(hash(j, 3, 5) * 17);
      add(`face-outer-${j}`, [rows[steps][j], rows[steps][j + 1], inner[j + 1], inner[j]],
        `hsl(22 16% ${light}%)`, "tope", "rgba(20,18,16,0.13)");
      add(`face-inner-${j}`, [inner[j], inner[j + 1], center],
        `hsl(22 16% ${36 + Math.round(hash(j, 4, 5) * 15)}%)`, "tope", "rgba(20,18,16,0.11)");
    }
    // Deliberadamente SIN piso: el área inferior queda abierta.
    return result.sort((a, b) => b.depth - a.depth);
  }, [A, H, L, yaw, pitch, zoom]);

  const reset = () => { setYaw(17); setPitch(10); setZoom(1); setSelected(null); };

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">VISUALIZACIÓN DE LA LABOR</p>
          <h3 className="mt-1 font-display text-xl font-bold uppercase text-foreground">Hastiales · Corona · Tope</h3>
          <p className="mt-1 text-xs text-muted-foreground">Superficies rocosas diferenciadas. Toca una zona para identificarla.</p>
        </div>
        <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">Modelo referencial</span>
      </div>

      <div className="relative mx-3 overflow-hidden rounded-xl border border-white/10 bg-[#0c1115] sm:mx-5">
        <svg
          viewBox="0 0 420 380"
          className="block aspect-[420/380] w-full cursor-grab touch-none select-none active:cursor-grabbing"
          role="img"
          aria-label="Vista tridimensional giratoria de los hastiales, la corona y el tope rocoso de una labor minera, sin piso."
          onPointerDown={e => {
            dragging.current = { x: e.clientX, y: e.clientY, yaw, pitch };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={e => {
            if (!dragging.current) return;
            const d = dragging.current;
            setYaw(d.yaw + (e.clientX - d.x) * 0.38);
            setPitch(Math.max(-65, Math.min(65, d.pitch + (e.clientY - d.y) * 0.25)));
          }}
          onPointerUp={e => {
            dragging.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => { dragging.current = null; }}
        >
          <defs>
            <radialGradient id="labor-background" cx="50%" cy="42%" r="75%">
              <stop stopColor="#27323a" />
              <stop offset="0.65" stopColor="#10191f" />
              <stop offset="1" stopColor="#070c11" />
            </radialGradient>
            <linearGradient id="labor-light" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#e5c18a" stopOpacity="0.11" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="420" height="380" fill="url(#labor-background)" />
          <ellipse cx="210" cy="183" rx="165" ry="130" fill="url(#labor-light)" />
          {faces.map(face => (
            <polygon key={face.id} points={face.points}
              fill={selected === face.surface ? (face.surface === "tope" ? "#a97848" : face.surface === "corona" ? "#d0aa6a" : "#8eaaa9") : face.color}
              fillOpacity={selected && selected !== face.surface ? 0.34 : 1}
              stroke={selected === face.surface ? "#e8c68a" : face.stroke}
              strokeWidth={selected === face.surface ? 0.85 : 0.45}
              strokeLinejoin="round" />
          ))}
          <rect x="12" y="12" width="119" height="24" rx="6" fill="#101a20" fillOpacity="0.88" />
          <circle cx="25" cy="24" r="4" fill="#e3ae49" />
          <text x="36" y="28" fill="#e8e9e8" fontSize="10" fontWeight="bold">VISTA INTERACTIVA</text>
          <text x="16" y="363" fill="#c3cbd0" fontSize="11">Desliza para girar · Sin piso</text>
        </svg>
      </div>

      <div className="px-3 pt-3 sm:px-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Identificar superficies</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            { key: "izquierdo", label: "Hastial izq.", color: "#8eaaa9" },
            { key: "derecho", label: "Hastial der.", color: "#647e80" },
            { key: "corona", label: "Corona", color: "#d0aa6a" },
            { key: "tope", label: "Tope", color: "#a97848" },
          ] as const).map(item => (
            <button key={item.key} type="button"
              aria-pressed={selected === item.key}
              onClick={() => setSelected(current => current === item.key ? null : item.key)}
              className={`flex min-h-10 items-center gap-2 rounded-lg border px-2.5 text-left text-xs font-semibold transition-colors ${selected === item.key ? "border-primary bg-primary/10 text-foreground" : "border-border bg-secondary/60 text-muted-foreground hover:text-foreground"}`}>
              <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
        {selected && <p className="mt-2 text-xs text-primary" aria-live="polite">
          {selected === "corona" ? "Corona: bóveda superior de la labor." : selected === "tope" ? "Tope: frente de excavación al final del avance." : selected === "izquierdo" ? "Hastial izquierdo: pared lateral izquierda." : "Hastial derecho: pared lateral derecha."}
        </p>}
      </div>

      <div className="grid grid-cols-3 gap-2 px-3 pt-3 sm:px-5">
        {[
          { label: "ANCHO", value: A },
          { label: "ALTURA", value: H },
          { label: "AVANCE", value: L },
        ].map(item => (
          <div key={item.label} className="rounded-lg border border-border bg-background/50 px-2 py-2.5 text-center">
            <p className="text-[10px] font-bold tracking-wider text-muted-foreground">{item.label}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums text-foreground">{item.value.toFixed(2)} <span className="text-xs font-medium text-muted-foreground">m</span></p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 px-3 py-3 sm:px-5">
        <button type="button" onClick={() => setZoom(v => Math.max(0.55, v - 0.15))}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-xs font-semibold text-foreground" aria-label="Alejar">
          <ZoomOut className="size-4" /> Alejar
        </button>
        <button type="button" onClick={reset}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-xs font-semibold text-foreground">
          <RotateCcw className="size-4" /> Centrar
        </button>
        <button type="button" onClick={() => setZoom(v => Math.min(2.1, v + 0.15))}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-xs font-semibold text-foreground" aria-label="Acercar">
          <ZoomIn className="size-4" /> Acercar
        </button>
      </div>
      <p className="px-4 pb-4 text-[11px] leading-relaxed text-muted-foreground sm:px-5">
        Superficies mostradas: hastial izquierdo, hastial derecho, corona y tope. No incluye piso.
        Los colores y el relieve sirven para identificar zonas; no son mediciones de roca ni fotogrametría. No modifican el cálculo de shotcrete.
      </p>
    </section>
  );
}
