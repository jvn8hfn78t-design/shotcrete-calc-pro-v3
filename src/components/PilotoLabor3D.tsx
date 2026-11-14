import { useEffect, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

type Zone = "left" | "right" | "crown" | "face";
type Vertex = [number, number, number];
type Triangle = { a: Vertex; b: Vertex; c: Vertex; zone: Zone; shade: number };
const zones: { id: Zone; name: string; color: string }[] = [
  { id: "left", name: "Hastial izquierdo", color: "#8e8579" },
  { id: "crown", name: "Corona", color: "#50483e" },
  { id: "right", name: "Hastial derecho", color: "#77736c" },
  { id: "face", name: "Tope", color: "#a59b8b" },
];
const noise = (a: number, b: number, c: number) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

function createMesh(width: number, height: number, length: number): Triangle[] {
  const radius = width / 2;
  const wall = Math.max(0, height - radius);
  const wallParts = 18;
  const crownParts = 36;
  const segments = wallParts * 2 + crownParts;
  const rows = 52;
  const reliefScale = Math.min(width, height);
  const profile = (index: number): [number, number, Zone, number, number] => {
    if (index <= wallParts)
      return [-radius, (wall * index) / wallParts, "left", -1, 0];
    if (index <= wallParts + crownParts) {
      const angle = (Math.PI * (index - wallParts)) / crownParts;
      return [
        -radius * Math.cos(angle),
        wall + radius * Math.sin(angle),
        "crown",
        -Math.cos(angle),
        Math.sin(angle),
      ];
    }
    return [
      radius,
      wall * (1 - (index - wallParts - crownParts) / wallParts),
      "right",
      1,
      0,
    ];
  };
  const relief = (u: number, v: number) =>
    reliefScale *
    (0.022 * Math.sin(u * 0.48 + Math.sin(v * 0.23) * 0.8) * Math.cos(v * 0.37 - u * 0.14) +
      0.010 * Math.sin(u * 1.29 + v * 0.97) * Math.cos(u * 0.73 - v * 0.79) +
      0.010 * (noise(u, v, 1) - 0.5));

  const shell: Vertex[][] = [];
  for (let step = 0; step <= rows; step++) {
    const ring: Vertex[] = [];
    for (let index = 0; index <= segments; index++) {
      const [x, y, , nx, ny] = profile(index);
      const uneven = relief(index, step);
      ring.push([
        x + nx * uneven,
        y + ny * uneven + reliefScale * 0.003 * (noise(index, step, 8) - 0.5),
        (length * step) / rows + reliefScale * 0.004 * (noise(index, step, 9) - 0.5),
      ]);
    }
    shell.push(ring);
  }

  const triangles: Triangle[] = [];
  const add = (a: Vertex, b: Vertex, c: Vertex, zone: Zone, shade: number) =>
    triangles.push({ a, b, c, zone, shade });

  for (let step = 0; step < rows; step++) {
    for (let index = 0; index < segments; index++) {
      const zone = profile(index)[2];
      const a = shell[step]![index]!;
      const b = shell[step + 1]![index]!;
      const c = shell[step + 1]![index + 1]!;
      const d = shell[step]![index + 1]!;
      add(a, b, c, zone, noise(index, step, 4));
      add(a, c, d, zone, noise(index, step, 5));
    }
  }

  // The tunnel face is filled by successive rocky rings. There is no floor mesh.
  const middleHeight = height * 0.49;
  let outer = shell[rows]!;
  for (let band = 1; band <= 6; band++) {
    const fraction = 1 - band / 7;
    const inner: Vertex[] = [];
    for (let index = 0; index <= segments; index++) {
      const [x, y] = profile(index);
      const faceX = x * fraction;
      const faceY = middleHeight + (y - middleHeight) * fraction;
      const faceRelief =
        reliefScale *
        (0.023 * Math.sin(faceX * 5.2 + faceY * 4.9) * Math.cos(faceY * 3.4 - faceX * 4.1) +
          0.013 * (noise(index, band, 12) - 0.5));
      inner.push([faceX, faceY, length + faceRelief * (1 - fraction * 0.35)]);
    }
    for (let index = 0; index < segments; index++) {
      add(outer[index]!, outer[index + 1]!, inner[index + 1]!, "face", noise(index, band, 4));
      add(outer[index]!, inner[index + 1]!, inner[index]!, "face", noise(index, band, 5));
    }
    outer = inner;
  }
  const center: Vertex = [0, middleHeight, length + reliefScale * 0.005];
  for (let index = 0; index < segments; index++)
    add(outer[index]!, outer[index + 1]!, center, "face", noise(index, 21, 3));
  add(shell[rows]![0]!, shell[rows]![segments]!, center, "face", 0.6);
  return triangles;
}

type Camera = { yaw: number; pitch: number; zoom: number };
type Scene = {
  update: (mesh: Triangle[], width: number, height: number, length: number) => void;
  draw: (camera: Camera, selected: Zone | null) => void;
  dispose: () => void;
};
const DEFAULT_CAMERA: Camera = { yaw: -25, pitch: 12, zoom: 1.08 };
const zoneIndex: Record<Zone, number> = { left: 0, crown: 1, right: 2, face: 3 };
const surfaceColors: Record<Zone, Vertex> = {
  left: [0.59, 0.56, 0.52],
  crown: [0.35, 0.33, 0.30],
  right: [0.52, 0.50, 0.47],
  face: [0.70, 0.66, 0.60],
};

/** One GPU program per mounted viewer. Dragging only updates uniforms. */
function createScene(canvas: HTMLCanvasElement): Scene | null {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const result = gl.createShader(type);
    if (!result) throw new Error("Shader unavailable");
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      gl.deleteShader(result);
      throw new Error("Shader compile failed");
    }
    return result;
  };
  const vs = shader(
    gl.VERTEX_SHADER,
    `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    attribute float aZone;
    uniform mat3 uRotation;
    uniform vec3 uCenter;
    uniform vec3 uProjection;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying float vZone;
    varying vec3 vPosition;
    void main() {
      vec3 p = uRotation * (aPosition - uCenter);
      gl_Position = vec4(p * uProjection, 1.0);
      vNormal = uRotation * aNormal;
      vColor = aColor;
      vZone = aZone;
      vPosition = aPosition;
    }`,
  );
  let fs: WebGLShader;
  try {
    fs = shader(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying float vZone;
      varying vec3 vPosition;
      uniform float uSelected;
      uniform float uUnlit;
      float rockHash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      void main() {
        vec3 n = normalize(vNormal + vec3(0.00001));
        float key = abs(dot(n, normalize(vec3(-0.48, 0.72, -0.8))));
        float fill = abs(dot(n, normalize(vec3(0.72, 0.24, 0.55))));
        float lighting = mix(0.59 + key * 0.32 + fill * 0.12, 1.0, uUnlit);
        float coarse = rockHash(floor(vPosition * 20.0));
        float grain = rockHash(floor(vPosition * 65.0));
        float strata = sin(vPosition.y * 16.0 + sin(vPosition.x * 7.0 + vPosition.z * 4.0) * 2.0);
        float fissure = pow(max(0.0, sin(vPosition.x * 19.0 + vPosition.y * 14.0 - vPosition.z * 11.0)), 12.0);
        float variation = (coarse - 0.5) * 0.17 + (grain - 0.5) * 0.12 + strata * 0.045 - fissure * 0.10;
        float active = 1.0 - step(0.25, abs(vZone - uSelected));
        float hasSelection = step(-0.5, uSelected) * (1.0 - uUnlit);
        vec3 color = clamp(vColor * (lighting + variation), 0.025, 1.0);
        color = mix(color, mix(color * 0.35, min(color * 1.15 + vec3(0.05, 0.04, 0.02), 1.0), active), hasSelection);
        gl_FragColor = vec4(color, 1.0);
      }`,
    );
  } catch (error) {
    gl.deleteShader(vs);
    throw error;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const buffers: [WebGLBuffer | null, WebGLBuffer | null, WebGLBuffer | null] = [
    gl.createBuffer(),
    gl.createBuffer(),
    gl.createBuffer(),
  ];
  if (buffers.some((buffer) => !buffer)) {
    buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    gl.deleteProgram(program);
    return null;
  }
  const attributes = [
    { location: gl.getAttribLocation(program, "aPosition"), size: 3, offset: 0 },
    { location: gl.getAttribLocation(program, "aNormal"), size: 3, offset: 12 },
    { location: gl.getAttribLocation(program, "aColor"), size: 3, offset: 24 },
    { location: gl.getAttribLocation(program, "aZone"), size: 1, offset: 36 },
  ];
  const uniforms = {
    rotation: gl.getUniformLocation(program, "uRotation"),
    center: gl.getUniformLocation(program, "uCenter"),
    projection: gl.getUniformLocation(program, "uProjection"),
    selected: gl.getUniformLocation(program, "uSelected"),
    unlit: gl.getUniformLocation(program, "uUnlit"),
  };
  let dimensions: Vertex = [4, 4.2, 3.8];
  const counts: [number, number, number] = [0, 0, 0];
  const append = (data: number[], p: Vertex, normal: Vertex, color: Vertex, zone = -1) =>
    data.push(...p, ...normal, ...color, zone);
  const upload = (index: 0 | 1 | 2, data: number[]) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[index]);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    counts[index] = data.length / 10;
  };
  const bind = (index: 0 | 1 | 2) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[index]);
    for (const attribute of attributes) {
      gl.enableVertexAttribArray(attribute.location);
      gl.vertexAttribPointer(
        attribute.location,
        attribute.size,
        gl.FLOAT,
        false,
        40,
        attribute.offset,
      );
    }
  };
  return {
    update(mesh, width, height, length) {
      dimensions = [width, height, length];
      const surface: number[] = [],
        contours: number[] = [],
        grid: number[] = [];
      // Blend adjacent face normals for a quiet, readable stone surface.
      // Vertex positions and the original reference geometry remain untouched.
      const vertexNormals = new Map<Vertex, Vertex>();
      const faceNormals = mesh.map(({ a, b, c, zone }) => {
        const u: Vertex = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v: Vertex = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const normal: Vertex = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        if (zone === "face" && normal[2] > 0) {
          normal[0] = -normal[0];
          normal[1] = -normal[1];
          normal[2] = -normal[2];
        }
        if (zone !== "face")
          for (const vertex of [a, b, c]) {
            const sum = vertexNormals.get(vertex) ?? [0, 0, 0];
            vertexNormals.set(vertex, [sum[0] + normal[0], sum[1] + normal[1], sum[2] + normal[2]]);
          }
        const magnitude = Math.hypot(...normal) || 1;
        return normal.map((value) => value / magnitude) as Vertex;
      });
      mesh.forEach((triangle, index) => {
        const { a, b, c, zone, shade } = triangle;
        const faceNormal = faceNormals[index]!;
        const color = surfaceColors[zone].map((value) => value * (0.82 + shade * 0.34)) as Vertex;
        for (const vertex of [a, b, c]) {
          const average = zone === "face" ? faceNormal : vertexNormals.get(vertex)!;
          const magnitude = Math.hypot(...average) || 1;
          const normal = average.map(
            (value, axis) => (value / magnitude) * 0.64 + faceNormal[axis]! * 0.36,
          ) as Vertex;
          append(surface, vertex, normal, color, zoneIndex[zone]);
        }
        // The mouth of the tunnel stays legible as a fine amber contour.
        for (const [from, to] of [
          [a, b],
          [b, c],
          [c, a],
        ] as [Vertex, Vertex][]) {
          if (from[2] === 0 && to[2] === 0) {
            append(contours, from, [0, 0, 1], [0.85, 0.7, 0.43]);
            append(contours, to, [0, 0, 1], [0.85, 0.7, 0.43]);
          }
        }
      });
      // A sparse datum grid beneath the model; this is not a floor surface.
      const extent = Math.max(width, length, 3) * 0.82;
      const centerZ = length / 2;
      for (let i = -6; i <= 6; i++) {
        const offset = (i * extent) / 6;
        const color: Vertex = i === 0 ? [0.16, 0.23, 0.27] : [0.105, 0.15, 0.18];
        for (const p of [
          [-extent, -0.07, centerZ + offset],
          [extent, -0.07, centerZ + offset],
          [offset, -0.07, centerZ - extent],
          [offset, -0.07, centerZ + extent],
        ] as Vertex[]) {
          append(grid, p, [0, 1, 0], color);
        }
      }
      upload(0, surface);
      upload(1, contours);
      upload(2, grid);
    },
    draw(camera, selected) {
      if (gl.isContextLost()) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0.955, 0.95, 0.94, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      const y = (camera.yaw * Math.PI) / 180,
        p = (camera.pitch * Math.PI) / 180;
      const cy = Math.cos(y),
        sy = Math.sin(y),
        cp = Math.cos(p),
        sp = Math.sin(p);
      const rotation = new Float32Array([cy, sp * sy, -cp * sy, 0, cp, sp, sy, -sp * cy, cp * cy]);
      const [w, h, l] = dimensions;
      // Fit the rotated bounding box so every aspect ratio starts fully framed.
      const projectedWidth = Math.abs(cy) * w + Math.abs(sy) * l;
      const projectedHeight = Math.abs(sp * sy) * w + Math.abs(cp) * h + Math.abs(sp * cy) * l;
      const aspect = width / height;
      const scale = (1.48 * camera.zoom) / Math.max(projectedWidth / aspect, projectedHeight, 0.1);
      gl.uniformMatrix3fv(uniforms.rotation, false, rotation);
      gl.uniform3f(uniforms.center, 0, h / 2, l / 2);
      gl.uniform3f(uniforms.projection, scale / aspect, scale, 0.8 / Math.max(w + h + l, 1));
      gl.uniform1f(uniforms.selected, selected === null ? -1 : zoneIndex[selected]);
      gl.uniform1f(uniforms.unlit, 0);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      bind(0);
      gl.drawArrays(gl.TRIANGLES, 0, counts[0]);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    },
    dispose() {
      buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      gl.deleteProgram(program);
    },
  };
}

export function PilotoLabor3D({
  ancho = 4,
  alto = 4.2,
  longitud = 3.8,
}: {
  ancho?: number;
  alto?: number;
  longitud?: number;
}) {
  const width = Math.max(0.5, ancho);
  const height = Math.max(width / 2, alto);
  const length = Math.max(0.1, longitud);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const dragRef = useRef<{ x: number; y: number; camera: Camera; pointerId: number } | null>(null);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [selected, setSelected] = useState<Zone | null>(null);
  const [supported, setSupported] = useState(true);
  const [contextVersion, setContextVersion] = useState(0);
  const currentRef = useRef({ camera, selected });
  currentRef.current = { camera, selected };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lost = (event: Event) => {
      event.preventDefault();
      setSupported(false);
    };
    const restored = () => setContextVersion((value) => value + 1);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    try {
      sceneRef.current = createScene(canvas);
      setSupported(!!sceneRef.current);
    } catch {
      setSupported(false);
    }
    const observer = new ResizeObserver(() => {
      const current = currentRef.current;
      sceneRef.current?.draw(current.camera, current.selected);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [contextVersion]);
  useEffect(() => {
    sceneRef.current?.update(createMesh(width, height, length), width, height, length);
    const current = currentRef.current;
    sceneRef.current?.draw(current.camera, current.selected);
  }, [width, height, length, contextVersion]);
  useEffect(() => {
    sceneRef.current?.draw(camera, selected);
  }, [camera, selected]);
  const changeZoom = (delta: number) =>
    setCamera((value) => ({ ...value, zoom: Math.max(0.5, Math.min(2, value.zoom + delta)) }));
  const reset = () => {
    setCamera(DEFAULT_CAMERA);
    setSelected(null);
  };
  const controlClass =
    "flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-secondary/65 px-3 text-xs font-semibold text-foreground transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent active:scale-[0.97] disabled:opacity-35";

  return (
    <section
      className="overflow-hidden rounded-[1.5rem] bg-white/[0.035] p-1.5 ring-1 ring-white/[0.07]"
      aria-labelledby="model-heading"
    >
      <div className="overflow-hidden rounded-[1.15rem] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-muted-foreground">
              Visor de geometría
            </p>
            <h3 id="model-heading" className="mt-0.5 font-display text-2xl font-semibold">
              Labor en tres dimensiones
            </h3>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" /> Modelo referencial
          </span>
        </div>
        <div className="relative mx-2 overflow-hidden rounded-xl bg-[#f4f2ee] ring-1 ring-white/[0.08] sm:mx-3">
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#5f5b54]">
            <span className="h-2 w-2 rounded-sm border border-[#8da1ae]/50" />{" "}
            {selected ? zones.find((zone) => zone.id === selected)?.name : "Vista de superficies"}
          </div>
          <div
            className="absolute right-3 top-3 flex rounded-lg bg-white/85 p-1 ring-1 ring-black/10"
            aria-label="Vistas del modelo"
          >
            {[
              { name: "3D", title: "Vista tridimensional", yaw: -25, pitch: 12 },
              { name: "Frente", title: "Vista frontal", yaw: 0, pitch: 0 },
            ].map((view) => (
              <button
                key={view.name}
                type="button"
                aria-label={view.title}
                aria-pressed={camera.yaw === view.yaw && camera.pitch === view.pitch}
                onClick={() => setCamera({ yaw: view.yaw, pitch: view.pitch, zoom: 1 })}
                className={`min-h-10 rounded-md px-3 text-[11px] font-semibold transition-colors ${camera.yaw === view.yaw && camera.pitch === view.pitch ? "bg-stone-800 text-white" : "text-stone-600 hover:text-stone-900"}`}
              >
                {view.name}
              </button>
            ))}
          </div>
          <canvas
            ref={canvasRef}
            className="block h-[300px] w-full touch-none cursor-grab active:cursor-grabbing sm:h-[360px] lg:h-[400px]"
            tabIndex={0}
            role="img"
            aria-describedby="model-help"
            aria-label="Modelo tridimensional referencial de la labor, sin piso. Arrastra o usa las flechas para girar; más y menos para zoom; Inicio para centrar."
            onKeyDown={(event) => {
              const keys = [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "+",
                "=",
                "-",
                "Home",
              ];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              if (event.key === "Home") reset();
              else if (["+", "=", "-"].includes(event.key))
                changeZoom(event.key === "-" ? -0.15 : 0.15);
              else
                setCamera((value) => ({
                  ...value,
                  yaw:
                    value.yaw +
                    (event.key === "ArrowLeft" ? -8 : event.key === "ArrowRight" ? 8 : 0),
                  pitch: Math.max(
                    -65,
                    Math.min(
                      65,
                      value.pitch +
                        (event.key === "ArrowUp" ? -6 : event.key === "ArrowDown" ? 6 : 0),
                    ),
                  ),
                }));
            }}
            onPointerDown={(event) => {
              if (dragRef.current) return;
              dragRef.current = {
                x: event.clientX,
                y: event.clientY,
                camera,
                pointerId: event.pointerId,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              setCamera({
                ...drag.camera,
                yaw: drag.camera.yaw + (event.clientX - drag.x) * 0.35,
                pitch: Math.max(
                  -65,
                  Math.min(65, drag.camera.pitch + (event.clientY - drag.y) * 0.25),
                ),
              });
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) return;
              dragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
            onLostPointerCapture={() => {
              dragRef.current = null;
            }}
          />
          {!supported && (
            <p
              role="status"
              className="absolute inset-0 flex items-center justify-center bg-background/95 p-6 text-center text-sm text-muted-foreground"
            >
              El visor 3D no está disponible en este dispositivo. Los cálculos siguen funcionando.
            </p>
          )}
          <div className="pointer-events-none absolute bottom-4 left-4 text-[10px] font-medium tracking-wide text-[#5f5b54]">
            Arrastra para explorar <span className="mx-1.5 text-[#a8a096]">/</span> Sin piso
          </div>
          <div
            className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 text-[9px] font-semibold text-[#6a645c]"
            aria-hidden="true"
          >
            <span className="h-px w-5 bg-[#b99561]" /> A{" "}
            <span className="ml-1 h-3 w-px bg-[#7f9ba2]" /> H{" "}
            <span className="ml-1 h-px w-4 -rotate-45 bg-[#597b8b]" /> L
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 py-3 sm:px-4">
          {[
            { label: "Ancho · A", value: ancho },
            { label: "Altura · H", value: alto },
            { label: "Avance · L", value: longitud },
          ].map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-xl bg-background/50 px-2.5 py-2.5 sm:px-3"
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
                {item.value.toLocaleString("es-PE", { maximumFractionDigits: 2 })}{" "}
                <span className="text-xs font-normal text-muted-foreground">m</span>
              </p>
            </div>
          ))}
        </div>
        <div className="px-3 sm:px-4">
          <p className="mb-2 text-[10px] font-semibold text-muted-foreground">
            Resaltar una superficie
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {zones.map((zone) => (
              <button
                type="button"
                key={zone.id}
                aria-pressed={selected === zone.id}
                onClick={() => setSelected((value) => (value === zone.id ? null : zone.id))}
                className={`flex min-h-12 items-center gap-2 rounded-xl px-2.5 text-left text-[11px] font-semibold ring-1 transition-colors ${selected === zone.id ? "bg-primary/10 text-foreground ring-primary/40" : "bg-secondary/40 text-muted-foreground ring-white/[0.05] hover:bg-secondary"}`}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: zone.color }} />
                {zone.name}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => changeZoom(-0.15)}
              disabled={camera.zoom <= 0.5}
              className={controlClass}
            >
              <ZoomOut strokeWidth={1.5} className="size-4" /> Alejar
            </button>
            <button type="button" onClick={reset} className={controlClass}>
              <RotateCcw strokeWidth={1.5} className="size-3.5" /> Centrar
            </button>
            <button
              type="button"
              onClick={() => changeZoom(0.15)}
              disabled={camera.zoom >= 2}
              className={controlClass}
            >
              <ZoomIn strokeWidth={1.5} className="size-4" /> Acercar
            </button>
          </div>
        </div>
        <p
          id="model-help"
          className="px-4 pb-4 pt-3 text-[10px] leading-relaxed text-muted-foreground sm:px-5"
        >
          Geometría ilustrativa a partir de las medidas de labor. Hastiales, corona y tope, sin
          piso. No es un levantamiento fotogramétrico ni modifica la cubicación.
          {alto < width / 2 &&
            " La herradura se representa con una altura mínima igual a la mitad del ancho; las medidas indicadas corresponden a la entrada."}
        </p>
      </div>
    </section>
  );
}
