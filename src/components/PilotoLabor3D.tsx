import { useEffect, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

type Zone = "left" | "right" | "crown" | "face";
type Vertex = [number, number, number];
type Triangle = { a: Vertex; b: Vertex; c: Vertex; zone: Zone; shade: number };
const zones: { id: Zone; name: string; color: string }[] = [
  { id: "left", name: "Hastial izquierdo", color: "#879da0" },
  { id: "crown", name: "Corona", color: "#d1ae75" },
  { id: "right", name: "Hastial derecho", color: "#657d86" },
  { id: "face", name: "Tope", color: "#b48b65" },
];
const noise = (a: number, b: number, c: number) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

function createMesh(width: number, height: number, length: number): Triangle[] {
  const r = width / 2;
  const wall = Math.max(0, height - r);
  const segments = 40;
  const rows = 25;
  const wallParts = 10;
  const crownParts = 20;
  const profile = (i: number): [number, number, Zone] => {
    if (i <= wallParts) return [-r, wall * i / wallParts, "left"];
    if (i <= wallParts + crownParts) {
      const t = (i - wallParts) / crownParts;
      return [-r * Math.cos(Math.PI * t), wall + r * Math.sin(Math.PI * t), "crown"];
    }
    return [r, wall * (1 - (i - wallParts - crownParts) / wallParts), "right"];
  };
  const shell: Vertex[][] = [];
  for (let k = 0; k <= rows; k++) {
    const line: Vertex[] = [];
    for (let j = 0; j <= segments; j++) {
      const [x, y] = profile(j);
      const displacement = (noise(j, k, 1) - 0.5) * Math.min(width, height) * 0.038;
      const sign = x < 0 ? -1 : 1;
      line.push([x + displacement * sign, y + displacement * 0.4, length * k / rows]);
    }
    shell.push(line);
  }
  const tris: Triangle[] = [];
  const push = (a: Vertex, b: Vertex, c: Vertex, zone: Zone, shade: number) =>
    tris.push({ a, b, c, zone, shade });
  for (let k = 0; k < rows; k++) {
    for (let j = 0; j < segments; j++) {
      const zone = profile(j)[2];
      const a = shell[k][j], b = shell[k + 1][j], c = shell[k + 1][j + 1], d = shell[k][j + 1];
      push(a, b, c, zone, noise(j, k, 4));
      push(a, c, d, zone, noise(j, k, 5));
    }
  }
  // Tope de herradura cerrado, con triangulación regular y relieve leve.
  // El borde inferior se cierra únicamente en el tope; no existe malla de piso.
  const center: Vertex = [0, height * 0.49, length];
  const middle: Vertex[] = [];
  for (let j = 0; j <= segments; j++) {
    const [x, y] = profile(j);
    middle.push([x * 0.5, height * 0.49 + (y - height * 0.49) * 0.5, length + (noise(j, 9, 2) - 0.5) * 0.015]);
  }
  for (let j = 0; j < segments; j++) {
    push(shell[rows][j], shell[rows][j + 1], middle[j + 1], "face", noise(j, 7, 1));
    push(shell[rows][j], middle[j + 1], middle[j], "face", noise(j, 7, 2));
    push(middle[j], middle[j + 1], center, "face", noise(j, 7, 3));
  }
  push([-r, 0, length], [r, 0, length], center, "face", 0.5);
  return tris;
}

function renderScene(
  canvas: HTMLCanvasElement, mesh: Triangle[], yaw: number, pitch: number,
  zoom: number, selected: Zone | null,
) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
  if (!gl) return false;
  const vertexShaderSource = `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    varying vec3 vColor;
    uniform mat4 uMatrix;
    void main() {
      gl_Position = uMatrix * vec4(aPosition, 1.0);
      vColor = aColor;
    }`;
  const fragmentShaderSource = `
    precision mediump float;
    varying vec3 vColor;
    void main() { gl_FragColor = vec4(vColor, 1.0); }`;
  const shader = (type: number, source: string) => {
    const obj = gl.createShader(type);
    if (!obj) throw new Error("Shader unavailable");
    gl.shaderSource(obj, source); gl.compileShader(obj);
    if (!gl.getShaderParameter(obj, gl.COMPILE_STATUS)) throw new Error("Shader compile failed");
    return obj;
  };
  const program = gl.createProgram();
  if (!program) return false;
  try {
    const vs = shader(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = shader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);
    const width = canvas.clientWidth || 420;
    const height = canvas.clientHeight || 360;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.045, 0.065, 0.085, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const radY = yaw * Math.PI / 180, radX = pitch * Math.PI / 180;
    const cosY = Math.cos(radY), sinY = Math.sin(radY);
    const cosX = Math.cos(radX), sinX = Math.sin(radX);
    const all = mesh.flatMap(t => [t.a, t.b, t.c]);
    const maxDim = Math.max(...all.map(p => Math.abs(p[0])), ...all.map(p => p[1]), ...all.map(p => p[2]), 3);
    const scale = 1.9 * zoom / maxDim;
    // Cámara oblicua desde la entrada, mirando hacia el frente.
    const transform = (p: Vertex): Vertex => {
      const x = p[0], y = p[1] - maxDim * 0.36, z = p[2] - maxDim * 0.38;
      const rx = x * cosY + z * sinY;
      const rz = -x * sinY + z * cosY;
      return [rx * scale, (y * cosX - rz * sinX) * scale, (y * sinX + rz * cosX) * scale];
    };
    const aspect = canvas.width / canvas.height;
    // Ortho projection, preserving aspect and allowing full orbit.
    const matrix = new Float32Array([
      1 / Math.max(1, aspect), 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -0.35, 0,
      0, 0, 0, 1,
    ]);
    const colors: Record<Zone, [number, number, number]> = {
      left: [0.43, 0.52, 0.53],
      right: [0.35, 0.42, 0.46],
      crown: [0.62, 0.53, 0.40],
      face: [0.55, 0.43, 0.33],
    };
    const vertices: number[] = [];
    const colorData: number[] = [];
    for (const t of mesh) {
      const a = transform(t.a), b = transform(t.b), c = transform(t.c);
      const u: Vertex = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v: Vertex = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal: Vertex = [
        u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0],
      ];
      const norm = Math.hypot(...normal) || 1;
      const light = 0.60 + 0.34 * Math.abs((normal[0] * 0.3 + normal[1] * 0.8 + normal[2] * 0.5) / norm);
      const shade = (0.82 + t.shade * 0.35) * light;
      const base = colors[t.zone];
      const active = selected === t.zone;
      const fade = selected && !active ? 0.33 : 1;
      const boost = active ? 1.42 : 1;
      for (const p of [a, b, c]) {
        vertices.push(...p);
        colorData.push(...base.map(ch => Math.min(1, ch * shade * fade * boost)));
      }
    }
    const upload = (attribute: string, data: number[]) => {
      const buffer = gl.createBuffer();
      if (!buffer) return null;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, attribute);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
      return buffer;
    };
    const pos = upload("aPosition", vertices);
    const col = upload("aColor", colorData);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uMatrix"), false, matrix);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);
    if (pos) gl.deleteBuffer(pos);
    if (col) gl.deleteBuffer(col);
    return true;
  } finally {
    gl.deleteProgram(program);
  }
}

export function PilotoLabor3D({ ancho = 4, alto = 4.2, longitud = 3.8 }: {
  ancho?: number; alto?: number; longitud?: number;
}) {
  const width = Math.max(0.5, ancho);
  const height = Math.max(width / 2, alto);
  const length = Math.max(0.1, longitud);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [yaw, setYaw] = useState(8);
  const [pitch, setPitch] = useState(8);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<Zone | null>(null);
  const [supported, setSupported] = useState(true);
  const mesh = useRef<Triangle[]>([]);
  useEffect(() => { mesh.current = createMesh(width, height, length); }, [width, height, length]);
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      setSupported(renderScene(canvasRef.current, mesh.current, yaw, pitch, zoom, selected));
    } catch { setSupported(false); }
  }, [width, height, length, yaw, pitch, zoom, selected]);
  const reset = () => { setYaw(8); setPitch(8); setZoom(1); setSelected(null); };

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="px-4 pb-3 pt-4 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">MODELO 3D · LABOR SUBTERRÁNEA</p>
        <h3 className="mt-1 font-display text-xl font-bold uppercase">Hastiales · Corona · Tope</h3>
        <p className="mt-1 text-xs text-muted-foreground">Nueva visualización tridimensional con relieve rocoso ilustrativo.</p>
      </div>
      <div className="relative mx-3 overflow-hidden rounded-xl border border-border bg-[#0b1116] sm:mx-5">
        <canvas ref={canvasRef} className="block aspect-[420/350] w-full touch-none cursor-grab active:cursor-grabbing"
          aria-label="Modelo tridimensional de la labor minera sin piso. Arrastra para girar."
          onPointerDown={e => {
            dragRef.current = { x: e.clientX, y: e.clientY, yaw, pitch };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={e => {
            if (!dragRef.current) return;
            const d = dragRef.current;
            setYaw(d.yaw + (e.clientX - d.x) * 0.35);
            setPitch(Math.max(-70, Math.min(70, d.pitch + (e.clientY - d.y) * 0.25)));
          }}
          onPointerUp={e => {
            dragRef.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => { dragRef.current = null; }}
        />
        {!supported && <p className="absolute inset-0 flex items-center justify-center bg-background/95 p-6 text-center text-sm text-muted-foreground">
          Este dispositivo no permite mostrar WebGL. Los cálculos siguen funcionando.
        </p>}
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/55 px-2 py-1 text-[11px] text-white">
          Desliza para girar · Sin piso
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pt-3 sm:grid-cols-4 sm:px-5">
        {zones.map(z => (
          <button type="button" key={z.id} aria-pressed={selected === z.id}
            onClick={() => setSelected(s => s === z.id ? null : z.id)}
            className={`flex min-h-10 items-center gap-2 rounded-lg border px-2 text-left text-xs font-semibold ${selected === z.id ? "border-primary bg-primary/10" : "border-border bg-secondary"}`}>
            <span className="size-3 shrink-0 rounded-sm" style={{ background: z.color }} />{z.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 pt-3 sm:px-5">
        {[
          { label: "ANCHO", value: width },
          { label: "ALTURA", value: height },
          { label: "AVANCE", value: length },
        ].map(item => (
          <div key={item.label} className="rounded-lg border border-border bg-background/50 px-2 py-2 text-center">
            <p className="text-[10px] font-bold text-muted-foreground">{item.label}</p>
            <p className="font-display text-lg font-bold tabular-nums">{item.value.toFixed(2)} <span className="text-xs font-medium text-muted-foreground">m</span></p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-3 py-3 sm:px-5">
        <button type="button" onClick={() => setZoom(v => Math.max(0.5, v - 0.15))} className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-secondary text-xs font-bold"><ZoomOut className="size-4" />Alejar</button>
        <button type="button" onClick={reset} className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-secondary text-xs font-bold"><RotateCcw className="size-4" />Centrar</button>
        <button type="button" onClick={() => setZoom(v => Math.min(2, v + 0.15))} className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-secondary text-xs font-bold"><ZoomIn className="size-4" />Acercar</button>
      </div>
      <p className="px-4 pb-4 text-[11px] text-muted-foreground sm:px-5">
        Superficies: hastiales, corona y tope. Sin piso. Modelo geométrico ilustrativo, no fotogramétrico;
        no modifica los cálculos de shotcrete.
      </p>
    </section>
  );
}
