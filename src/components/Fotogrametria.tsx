import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  RotateCcw,
  ScanLine,
  X,
  ArrowLeft,
  ArrowRight,
  Download,
  Check,
  Info,
} from "lucide-react";
import { ReconstructionViewer } from "./ReconstructionViewer";
import {
  loadSurveyDraft,
  saveSurveyDraft,
  prepareSurveyPhoto,
  type SurveyPhoto,
} from "@/lib/survey-draft";
import type { ReconstructionResult } from "@/lib/reconstruction-types";

function PhotoThumbnail({
  photo,
  index,
  disabled,
  onRemove,
  onMove,
  last,
}: {
  photo: SurveyPhoto;
  index: number;
  disabled: boolean;
  last: boolean;
  onRemove: () => void;
  onMove: (direction: number) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(photo.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo.blob]);
  return (
    <li className="overflow-hidden rounded-xl border border-white/10 bg-background/70">
      <div className="relative">
        {url && (
          <img
            src={url}
            alt={`Foto ${index + 1}: ${photo.name}`}
            className="aspect-[4/3] w-full object-cover"
          />
        )}
        <span className="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-1 text-xs text-white">
          {String(index + 1).padStart(2, "0")}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Quitar foto ${index + 1}`}
          className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-full bg-black/70 text-white disabled:opacity-40"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-1 p-1">
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
          aria-label={`Mover foto ${index + 1} antes`}
          className="flex size-10 items-center justify-center rounded-lg hover:bg-secondary disabled:opacity-25"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={photo.name}>
          {photo.name}
        </span>
        <button
          type="button"
          disabled={disabled || last}
          onClick={() => onMove(1)}
          aria-label={`Mover foto ${index + 1} después`}
          className="flex size-10 items-center justify-center rounded-lg hover:bg-secondary disabled:opacity-25"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
    </li>
  );
}

export function Fotogrametria() {
  const [denseMode, setDenseMode] = useState(true);
  const [name, setName] = useState("");
  const [photos, setPhotos] = useState<SurveyPhoto[]>([]);
  const [result, setResult] = useState<ReconstructionResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, message: "" });
  const [message, setMessage] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const busy = processing || preparing || !loaded;

  useEffect(() => {
    mounted.current = true;
    void loadSurveyDraft()
      .then((draft) => {
        if (!mounted.current) return;
        if (draft && Array.isArray(draft.photos)) {
          setName(draft.name || "");
          setPhotos(draft.photos.slice(0, 12));
          setResult(draft.result || null);
          setStorageMessage("Sesión recuperada de este dispositivo.");
        }
      })
      .catch(() => {
        if (mounted.current)
          setStorageMessage(
            "El guardado local no está disponible. Exporta el resultado antes de salir.",
          );
      })
      .finally(() => {
        if (mounted.current) setLoaded(true);
      });
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      void saveSurveyDraft({ name, photos, result })
        .then(() => {
          if (mounted.current) setStorageMessage("Guardado en este dispositivo.");
        })
        .catch(() => {
          if (mounted.current)
            setStorageMessage(
              "No hay espacio para guardar esta sesión. Exporta el resultado antes de salir.",
            );
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loaded, name, photos, result]);

  useEffect(() => {
    if (!processing && !preparing) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [processing, preparing]);

  async function addPhotos(files: FileList | null) {
    if (!files?.length || busy) return;
    setPreparing(true);
    setMessage("");
    const incoming = Array.from(files);
    if (incoming.length + photos.length > 12) {
      setMessage("Puedes usar hasta 12 fotos. Retira alguna antes de añadir más.");
      setPreparing(false);
      return;
    }
    const additions: SurveyPhoto[] = [];
    const failures: string[] = [];
    try {
      for (const file of incoming) {
        try {
          additions.push(await prepareSurveyPhoto(file));
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "No se pudo leer una fotografía.");
        }
        if (!mounted.current) return;
      }
      if (additions.length) {
        setPhotos((current) => [...current, ...additions]);
        setResult(null);
      }
      if (failures.length) setMessage(failures.join(" "));
    } finally {
      if (mounted.current) setPreparing(false);
    }
  }

  function movePhoto(index: number, direction: number) {
    setPhotos((current) => {
      const next = [...current];
      const other = index + direction;
      if (!next[index] || !next[other]) return current;
      [next[index], next[other]] = [next[other]!, next[index]!];
      return next;
    });
    setResult(null);
  }

  async function reconstruct() {
    if (busy || photos.length < 3) return;
    setProcessing(true);
    setMessage("");
    setProgress({ percent: 0, message: "Preparando el motor de reconstrucción…" });
    const controller = new AbortController();
    abort.current = controller;
    try {
      const { reconstructPhotos } = await import("@/lib/reconstruction");
      if (controller.signal.aborted) return;
      const next = await reconstructPhotos(
        photos.map((photo) => new File([photo.blob], photo.name, { type: photo.blob.type })),
        {
          dense: denseMode,
          signal: controller.signal,
          onProgress: (update) => {
            if (mounted.current) setProgress(update);
          },
        },
      );
      if (!mounted.current || controller.signal.aborted) return;
      setResult(next);
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        }),
      );
    } catch (error) {
      if (!mounted.current) return;
      setMessage(
        controller.signal.aborted
          ? "Proceso cancelado. Tus fotos siguen disponibles."
          : error instanceof Error
            ? error.message
            : "No se pudo reconstruir. Prueba fotos más nítidas y con mayor superposición.",
      );
    } finally {
      if (mounted.current) setProcessing(false);
      if (abort.current === controller) abort.current = null;
    }
  }

  function downloadReport() {
    if (!result) return;
    const report = {
      labor: name || "Sin nombre",
      fecha: new Date().toISOString(),
      motor: result.engine,
      profundidad: result.dense,
      fotosRegistradas: result.registeredViews,
      fotosTotales: result.totalViews,
      puntos: result.points.length,
      errorReproyeccionPx: result.reprojectionError,
      escala: "relativa",
      advertencias: result.warnings,
      nota: "La escala manual del archivo PLY se aplica en el visor. Este informe describe la reconstrucción original, sin escala métrica. El error de reproyección no es una precisión en metros.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "informe-reconstruccion.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return (
    <div className="photogrammetry-workspace space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow mb-2 text-primary">02 / FOTOGRAMETRÍA</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Reconstrucción densa local
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Añade fotos de una misma zona. Reconstruye y guarda el resultado en tu dispositivo.
          </p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Procesamiento local · Fotos privadas
        </span>
      </header>
      <fieldset disabled={busy} className="rounded-2xl border border-white/10 bg-card p-4">
        <legend className="px-2 text-sm font-medium">Motor de reconstrucción</legend>
        <label className="mr-6 inline-flex min-h-12 items-center gap-2 text-sm">
          <input
            type="radio"
            name="engine"
            checked={denseMode}
            onChange={() => setDenseMode(true)}
          />{" "}
          Profundidad densa · Experimental
        </label>
        <label className="inline-flex min-h-12 items-center gap-2 text-sm">
          <input
            type="radio"
            name="engine"
            checked={!denseMode}
            onChange={() => setDenseMode(false)}
          />{" "}
          Puntos iniciales · Motor anterior
        </label>
        <p className="mt-2 text-sm text-muted-foreground">
          La opción densa compara regiones de las fotos y fusiona profundidad. Puede tardar varios
          minutos. Trabaja por tramos cortos; ninguna opción reconstruye zonas ocultas o sin
          correspondencias fiables.
        </p>
      </fieldset>
      <div className="rounded-2xl border border-white/10 bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <label className="block w-full max-w-sm text-sm font-medium">
            Nombre de la labor <span className="font-normal text-muted-foreground">(opcional)</span>
            <input
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Galería 120"
              className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3 text-base disabled:opacity-60"
            />
          </label>
          <span className="text-sm tabular-nums text-muted-foreground">
            {photos.length} / 12 fotos
          </span>
        </div>
        <div className="mb-5 rounded-xl bg-background/70 p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">
            Un recorrido corto, sin cambiar el zoom.
          </p>
          <p>
            Toma entre 3 y 12 fotos nítidas con buena luz. Desplázate lateralmente entre tomas y
            repite aproximadamente el 70 % de la vista anterior. Evita girar desde un solo punto.
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          disabled={busy}
          onChange={(event) => {
            void addPhotos(event.target.files);
            event.currentTarget.value = "";
          }}
          aria-label="Seleccionar fotografías"
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          disabled={busy}
          onChange={(event) => {
            void addPhotos(event.target.files);
            event.currentTarget.value = "";
          }}
          aria-label="Tomar una fotografía"
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || photos.length >= 12}
            onClick={() => fileInput.current?.click()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            <ImagePlus className="size-4" /> Añadir fotos
          </button>
          <button
            type="button"
            disabled={busy || photos.length >= 12}
            onClick={() => cameraInput.current?.click()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-input px-5 text-sm font-medium disabled:opacity-40"
          >
            <Camera className="size-4" /> Tomar foto
          </button>
        </div>
        {preparing && (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            Preparando copias ligeras de tus fotos…
          </p>
        )}
        {photos.length > 0 ? (
          <>
            <p className="mb-3 mt-5 text-sm text-muted-foreground">
              Orden del recorrido. Usa las flechas si necesitas cambiarlo.
            </p>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo, index) => (
                <PhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  index={index}
                  last={index === photos.length - 1}
                  disabled={busy}
                  onMove={(direction) => movePhoto(index, direction)}
                  onRemove={() => {
                    setPhotos((current) => current.filter((item) => item.id !== photo.id));
                    setResult(null);
                  }}
                />
              ))}
            </ol>
          </>
        ) : (
          <div className="mt-5 flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-background/40 p-5 text-center">
            <ScanLine className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Tus fotos aparecerán aquí.
              <br />
              Comienza con una zona pequeña y con textura.
            </p>
          </div>
        )}
        <div className="mt-6 border-t border-white/10 pt-5">
          {processing ? (
            <div aria-live="polite">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span>{progress.message}</span>
                <span className="tabular-nums">{Math.round(progress.percent)} %</span>
              </div>
              <progress
                value={progress.percent}
                max={100}
                className="h-2 w-full accent-primary"
                aria-label="Progreso de reconstrucción"
              />
              <button
                type="button"
                onClick={() => abort.current?.abort()}
                className="mt-4 min-h-12 rounded-full border border-input px-5 text-sm"
              >
                Cancelar proceso
              </button>
              <p className="mt-3 text-xs text-muted-foreground">
                Mantén esta página abierta. Puedes cambiar de pestaña dentro de la aplicación.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={busy || photos.length < 3}
                onClick={() => void reconstruct()}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground disabled:opacity-40"
              >
                <ScanLine className="size-5" />{" "}
                {result ? "Reconstruir de nuevo" : "Reconstruir en 3D"}
              </button>
              <span className="text-sm text-muted-foreground">
                {photos.length < 3
                  ? `Añade ${3 - photos.length} foto${3 - photos.length === 1 ? "" : "s"} más para comenzar.`
                  : "El tiempo depende del dispositivo y las fotos."}
              </span>
            </div>
          )}
          {message && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed"
            >
              {message}
            </p>
          )}
          <p role="status" className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {storageMessage || "Las fotos y el resultado permanecen en este dispositivo."}
          </p>
        </div>
      </div>
      {result && (
        <div ref={resultsRef} className="scroll-mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-1 flex items-center gap-2 text-sm text-primary">
                <Check className="size-4" />{" "}
                {processing
                  ? "Resultado anterior · Nuevo cálculo en curso"
                  : "Reconstrucción terminada"}
              </p>
              <h3 className="text-xl font-semibold">{name || "Resultado del recorrido"}</h3>
            </div>
            <button
              type="button"
              onClick={downloadReport}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-input px-4 text-sm"
            >
              <Download className="size-4" /> Informe técnico
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-card p-4">
              <p className="text-xs text-muted-foreground">Puntos reconstruidos</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {result.points.length.toLocaleString("es-PE")}
              </p>
            </div>
            <div className="rounded-xl bg-card p-4">
              <p className="text-xs text-muted-foreground">Fotos registradas</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {result.registeredViews} / {result.totalViews}
              </p>
            </div>
            <div className="col-span-2 rounded-xl bg-card p-4 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Tipo de resultado</p>
              <p className="mt-1 text-base font-medium">
                {result.dense ? "Profundidad densa · Sin malla" : "Puntos iniciales · Sin malla"}
              </p>
            </div>
          </div>
          {result.dense && (
            <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground">
              {result.dense.pairs} pares procesados ·{" "}
              {result.dense.accepted.toLocaleString("es-PE")} píxeles con profundidad aceptada de{" "}
              {result.dense.candidates.toLocaleString("es-PE")} candidatos. Esta cifra no mide el
              porcentaje de la labor levantado. Los huecos se conservan.
            </p>
          )}
          <ReconstructionViewer
            key={result.elapsedMs + ":" + result.points.length}
            points={result.points}
            dense={!!result.dense}
            fileName={name || "levantamiento"}
          />
          <details className="rounded-xl border border-white/10 bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Calidad y alcance del resultado
            </summary>
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                Error de reproyección de las cámaras iniciales:{" "}
                {result.reprojectionError.toFixed(2)} px. Mide el ajuste a las imágenes, no la
                exactitud en metros.
              </p>
              <p>
                La cámara se estima a partir de las imágenes. El resultado tiene escala relativa
                hasta que indiques una distancia conocida en el visor. No sustituye un levantamiento
                topográfico validado ni se usa para la cubicación de shotcrete.
              </p>
              {result.warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
            </div>
          </details>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        La reconstrucción requiere fotografías con detalle y desplazamiento entre tomas. Si no hay
        información suficiente, el motor pedirá repetir la captura.
      </p>
    </div>
  );
}
