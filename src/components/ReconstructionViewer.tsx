import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw, Ruler, ZoomIn, ZoomOut } from "lucide-react";

export type ReconstructionPoint = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
};
type Camera = { yaw: number; pitch: number; zoom: number };
type ProjectedPoint = { index: number; x: number; y: number; depth: number };
type Reference = { a: number; b: number; meters: number; factor: number };
const INITIAL_CAMERA: Camera = { yaw: -12, pitch: 8, zoom: 1 };
const channel = (value: number) =>
  Math.round(Math.max(0, Math.min(255, Number.isFinite(value) ? value : 150)));

/** PLY contains the reconstructed coordinates, never the viewer's projection. */
export function reconstructionPly(
  points: ReconstructionPoint[],
  reference: Reference | null = null,
) {
  const scale = reference?.factor ?? 1;
  const header = [
    "ply",
    "format ascii 1.0",
    "comment Shotcrete Calc Pro - reconstructed sparse point cloud",
    reference
      ? "comment units meters; scale supplied manually; not survey certified"
      : "comment units relative; no metric scale",
    ...(reference
      ? [
          `comment reference_vertex_indices ${reference.a} ${reference.b}`,
          `comment reference_distance_meters ${reference.meters}`,
          `comment scale_factor ${reference.factor}`,
        ]
      : []),
    `element vertex ${points.length}`,
    "property double x",
    "property double y",
    "property double z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "end_header",
  ];
  return (
    header
      .concat(
        points.map(
          (point) =>
            `${point.x * scale} ${point.y * scale} ${point.z * scale} ${channel(point.r)} ${channel(point.g)} ${channel(point.b)}`,
        ),
      )
      .join("\n") + "\n"
  );
}

export function ReconstructionViewer({
  points,
  fileName = "levantamiento",
}: {
  points: ReconstructionPoint[];
  fileName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projections = useRef<ProjectedPoint[]>([]);
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    camera: Camera;
    moved: boolean;
  } | null>(null);
  const [camera, setCamera] = useState<Camera>(INITIAL_CAMERA);
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [picking, setPicking] = useState<"a" | "b" | null>(null);
  const [meters, setMeters] = useState("");
  const [reference, setReference] = useState<Reference | null>(null);
  const [notice, setNotice] = useState("");
  const [canvasAvailable, setCanvasAvailable] = useState(true);
  const cloud = useMemo(
    () =>
      points.filter(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z),
      ),
    [points],
  );
  const bounds = useMemo(() => {
    const center = cloud.reduce(
      (sum, p) => ({
        x: sum.x + p.x / cloud.length,
        y: sum.y + p.y / cloud.length,
        z: sum.z + p.z / cloud.length,
      }),
      { x: 0, y: 0, z: 0 },
    );
    let radius = 0;
    for (const p of cloud)
      radius = Math.max(radius, Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z));
    return { center, radius: Math.max(radius, 0.000001) };
  }, [cloud]);
  const current = useRef({ camera, pointA, pointB, picking });
  current.current = { camera, pointA, pointB, picking };

  useEffect(() => {
    setPointA(null);
    setPointB(null);
    setPicking(null);
    setReference(null);
    setMeters("");
    setNotice("");
    setCamera(INITIAL_CAMERA);
  }, [points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      setCanvasAvailable(false);
      return;
    }
    setCanvasAvailable(true);
    let frame = 0;
    const render = () => {
      const { camera: view, pointA: a, pointB: b } = current.current;
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = "#0a1016";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "#1b2630";
      context.lineWidth = 0.6;
      for (let x = 20; x < width; x += 28) {
        for (let y = 20; y < height; y += 28) {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + 1, y);
          context.stroke();
        }
      }
      const yaw = (view.yaw * Math.PI) / 180,
        pitch = (view.pitch * Math.PI) / 180;
      const cy = Math.cos(yaw),
        sy = Math.sin(yaw),
        cp = Math.cos(pitch),
        sp = Math.sin(pitch);
      const scale = (Math.min(width, height) * 0.4 * view.zoom) / bounds.radius;
      const projected = cloud
        .map((p, index) => {
          const x = p.x - bounds.center.x,
            y = p.y - bounds.center.y,
            z = p.z - bounds.center.z;
          const horizontal = x * cy + z * sy,
            depth = -x * sy + z * cy;
          return {
            index,
            x: width / 2 + horizontal * scale,
            y: height / 2 + (y * cp - depth * sp) * scale,
            depth: y * sp + depth * cp,
          };
        })
        .sort((left, right) => right.depth - left.depth);
      projections.current = projected;
      const size = cloud.length > 10000 ? 1.7 : cloud.length > 1500 ? 2.2 : 3;
      for (const p of projected) {
        if (p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10) continue;
        const color = cloud[p.index]!;
        context.fillStyle = `rgb(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)})`;
        context.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
      const first = projected.find((p) => p.index === a),
        second = projected.find((p) => p.index === b);
      if (first && second) {
        context.strokeStyle = "#e8b63f";
        context.lineWidth = 1.5;
        context.setLineDash([5, 4]);
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
        context.stroke();
        context.setLineDash([]);
      }
      for (const [label, p] of [
        ["A", first],
        ["B", second],
      ] as const) {
        if (!p) continue;
        context.beginPath();
        context.arc(p.x, p.y, 7, 0, 2 * Math.PI);
        context.fillStyle = "#e8b63f";
        context.fill();
        context.strokeStyle = "#10161b";
        context.lineWidth = 2;
        context.stroke();
        context.font = "600 14px Barlow, sans-serif";
        context.fillStyle = "#fff";
        context.fillText(label, p.x + 11, p.y - 10);
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    canvas.addEventListener("reconstruction-redraw", schedule);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      canvas.removeEventListener("reconstruction-redraw", schedule);
    };
  }, [cloud, bounds]);
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event("reconstruction-redraw"));
  }, [camera, pointA, pointB]);

  const changeZoom = (amount: number) =>
    setCamera((value) => ({ ...value, zoom: Math.max(0.4, Math.min(4, value.zoom + amount)) }));
  const choose = (index: number, target: "a" | "b") => {
    if (target === "a") setPointA(index);
    else setPointB(index);
    setReference(null);
    setPicking(null);
    setNotice(`Punto ${target.toUpperCase()} seleccionado: ${index + 1}.`);
  };
  const knownDistance = Number(meters.replace(",", "."));
  const a = pointA === null ? undefined : cloud[pointA],
    b = pointB === null ? undefined : cloud[pointB];
  const distance = a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : 0;
  const canScale =
    !!a &&
    !!b &&
    pointA !== pointB &&
    distance > bounds.radius * 1e-7 &&
    Number.isFinite(knownDistance) &&
    knownDistance > 0 &&
    Number.isFinite(knownDistance / distance);
  const download = () => {
    const data = reconstructionPly(cloud, reference);
    const url = URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
    const link = document.createElement("a");
    link.href = url;
    const safeName =
      fileName
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 80) || "levantamiento";
    link.download = `${safeName}_${reference ? "escala_manual_m" : "escala_relativa"}.ply`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    setNotice("Nube PLY descargada. Puedes abrirla en CloudCompare o MeshLab.");
  };
  const buttonClass =
    "flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-40";

  return (
    <section
      className="space-y-4 rounded-2xl border border-white/10 bg-card p-4 sm:p-5"
      aria-label="Nube de puntos reconstruida"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Reconstrucción 3D</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {cloud.length.toLocaleString("es-PE")} puntos reconstruidos de tus imágenes
          </p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold">
          {reference ? "Escala manual · metros" : "Escala relativa"}
        </span>
      </div>
      <div className="relative overflow-hidden rounded-xl bg-[#0a1016]">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          className={`block h-[320px] w-full touch-none sm:h-[400px] ${picking ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
          aria-label="Nube reconstruida. Arrastra o usa las flechas para girar; más y menos para acercar; Inicio para centrar."
          onKeyDown={(event) => {
            if (
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "Home"].includes(
                event.key,
              )
            )
              return;
            event.preventDefault();
            if (event.key === "Home") setCamera(INITIAL_CAMERA);
            else if (["+", "=", "-"].includes(event.key))
              changeZoom(event.key === "-" ? -0.2 : 0.2);
            else
              setCamera((value) => ({
                ...value,
                yaw:
                  value.yaw + (event.key === "ArrowLeft" ? -8 : event.key === "ArrowRight" ? 8 : 0),
                pitch: Math.max(
                  -89,
                  Math.min(
                    89,
                    value.pitch +
                      (event.key === "ArrowUp" ? -8 : event.key === "ArrowDown" ? 8 : 0),
                  ),
                ),
              }));
          }}
          onPointerDown={(event) => {
            if (drag.current) return;
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              camera,
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointer !== event.pointerId) return;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5)
              start.moved = true;
            if (!start.moved) return;
            setCamera({
              ...start.camera,
              yaw: start.camera.yaw + (event.clientX - start.x) * 0.4,
              pitch: Math.max(
                -89,
                Math.min(89, start.camera.pitch + (event.clientY - start.y) * 0.4),
              ),
            });
          }}
          onPointerUp={(event) => {
            const start = drag.current;
            if (!start || start.pointer !== event.pointerId) return;
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            if (start.moved || !picking) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left,
              y = event.clientY - rect.top;
            let selected: ProjectedPoint | null = null,
              best = 16;
            // Frontmost wins equal-distance overlap, matching painter order.
            for (const p of projections.current) {
              const d = Math.hypot(p.x - x, p.y - y);
              if (d <= best) {
                selected = p;
                best = d;
              }
            }
            if (selected) choose(selected.index, picking);
            else setNotice("Toca más cerca de un punto visible; puedes acercar la vista.");
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        />
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 text-xs text-white">
          {picking
            ? `Toca el punto ${picking.toUpperCase()} de tu referencia`
            : "Arrastra para girar"}
        </span>
        {!canvasAvailable && (
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center bg-background/95 p-6 text-center text-sm"
          >
            No se puede mostrar la nube en este navegador. Puedes descargarla en PLY.
          </p>
        )}
        {cloud.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-sm text-muted-foreground">
            No hay puntos válidos para mostrar.
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => changeZoom(-0.2)}
          disabled={camera.zoom <= 0.4}
        >
          <ZoomOut className="size-4" aria-hidden="true" /> Alejar
        </button>
        <button type="button" className={buttonClass} onClick={() => setCamera(INITIAL_CAMERA)}>
          <RotateCcw className="size-4" aria-hidden="true" /> Centrar
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => changeZoom(0.2)}
          disabled={camera.zoom >= 4}
        >
          <ZoomIn className="size-4" aria-hidden="true" /> Acercar
        </button>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nube de puntos dispersa. Los huecos son zonas sin reconstruir.{" "}
        {reference
          ? "La escala depende de los puntos elegidos y de la distancia indicada; no certifica precisión topográfica."
          : "Para exportar en metros, añade una distancia conocida entre dos puntos."}
      </p>
      <details
        className="rounded-xl border border-white/10"
        onToggle={(event) => {
          if (!event.currentTarget.open) setPicking(null);
        }}
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          <Ruler className="mr-2 inline size-4" aria-hidden="true" /> Dar escala con una medida
          conocida <span className="font-normal text-muted-foreground">(opcional)</span>
        </summary>
        <div className="space-y-4 border-t border-white/10 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Elige los extremos de una referencia visible cuya longitud hayas medido en campo. Puedes
            tocar la nube o introducir sus números de punto.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { target: "a", label: "A", value: pointA },
                { target: "b", label: "B", value: pointB },
              ] as const
            ).map((item) => (
              <div key={item.target} className="min-w-0 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setPicking((value) => (value === item.target ? null : item.target));
                    setNotice("");
                  }}
                  aria-pressed={picking === item.target}
                  className={`${buttonClass} w-full ${picking === item.target ? "ring-2 ring-primary" : ""}`}
                >
                  Elegir punto {item.label}
                </button>
                <label className="block text-sm text-muted-foreground">
                  Número de punto {item.label}
                  <input
                    aria-label={`Número de punto ${item.label}`}
                    type="number"
                    min={1}
                    max={cloud.length}
                    step={1}
                    value={item.value === null ? "" : item.value + 1}
                    placeholder="Sin elegir"
                    className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground"
                    onChange={(event) => {
                      const index = Number(event.target.value) - 1;
                      const value =
                        event.target.value !== "" &&
                        Number.isInteger(index) &&
                        index >= 0 &&
                        index < cloud.length
                          ? index
                          : null;
                      if (item.target === "a") setPointA(value);
                      else setPointB(value);
                      setReference(null);
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
          <label className="block text-sm text-muted-foreground">
            Distancia real entre A y B (m)
            <input
              type="text"
              inputMode="decimal"
              value={meters}
              onChange={(event) => {
                setMeters(event.target.value);
                setReference(null);
              }}
              placeholder="Ej. 1.50"
              className="mt-1 h-12 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={!canScale}
            className="min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            onClick={() => {
              if (!canScale || pointA === null || pointB === null) return;
              setReference({
                a: pointA,
                b: pointB,
                meters: knownDistance,
                factor: knownDistance / distance,
              });
              setPicking(null);
              setNotice("Escala manual aplicada. La descarga PLY tendrá coordenadas en metros.");
            }}
          >
            Aplicar escala
          </button>
          {pointA !== null && pointA === pointB && (
            <p className="text-sm text-destructive">Elige dos puntos diferentes.</p>
          )}
        </div>
      </details>
      <button
        type="button"
        disabled={!cloud.length}
        onClick={download}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        <Download className="size-4" aria-hidden="true" /> Descargar nube 3D · PLY
      </button>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </section>
  );
}
