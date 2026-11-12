import { useEffect, useRef, useState } from "react";

const DB = "shotcrete-escaneo-video";
const STORE = "capturas";

function abrirBD(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function guardarVideo(blob: Blob) {
  const db = await abrirBD();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, "ultimo-video");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function leerVideo(): Promise<Blob | undefined> {
  const db = await abrirBD();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get("ultimo-video");
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

export function Fotogrametria() {
  const vista = useRef<HTMLVideoElement>(null);
  const camara = useRef<MediaStream | null>(null);
  const grabador = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const urlActual = useRef<string | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [video, setVideo] = useState<Blob | null>(null);
  const [mensaje, setMensaje] = useState("Listo para iniciar el escaneo.");
  const [duracion, setDuracion] = useState(0);
  const inicio = useRef(0);
  const reloj = useRef<number | null>(null);
  const [labor, setLabor] = useState("");
  const [nivel, setNivel] = useState("");
  const [tipo, setTipo] = useState<"antes" | "despues">("antes");

  function cerrarCamara() {
    if (reloj.current !== null) window.clearInterval(reloj.current);
    reloj.current = null;
    camara.current?.getTracks().forEach(track => track.stop());
    camara.current = null;
    if (vista.current) vista.current.srcObject = null;
    setGrabando(false);
  }
  useEffect(() => {
    let activo = true;
    void leerVideo().then(blob => {
      if (activo && blob) { setVideo(blob); setMensaje("Último video recuperado de este dispositivo."); }
    }).catch(() => { if (activo) setMensaje("No se pudo recuperar el video anterior."); });
    return () => {
      activo = false;
      if (reloj.current !== null) window.clearInterval(reloj.current);
      camara.current?.getTracks().forEach(track => track.stop());
      if (grabador.current?.state === "recording") grabador.current.stop();
      if (urlActual.current) URL.revokeObjectURL(urlActual.current);
    };
  }, []);

  async function iniciar() {
    if (grabando || preparando) return;
    setPreparando(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw new Error("Este navegador no admite grabación continua. Abre la aplicación en Safari con HTTPS.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } },
      });
      camara.current = stream;
      if (!vista.current) throw new Error("No se encontró la vista de cámara.");
      vista.current.srcObject = stream;
      await vista.current.play();
      const tipos = ["video/mp4", "video/webm;codecs=vp8", "video/webm"];
      const mime = tipos.find(t => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      grabador.current = recorder;
      trozos.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) trozos.current.push(e.data); };
      recorder.onerror = () => { setMensaje("Error de grabación. Comprueba espacio libre."); cerrarCamara(); };
      recorder.onstop = () => {
        const blob = new Blob(trozos.current, { type: recorder.mimeType || "video/mp4" });
        cerrarCamara();
        if (!blob.size) { setMensaje("No se obtuvo un video válido."); return; }
        setVideo(blob);
        setMensaje("Video capturado. Guardando en este dispositivo…");
        void guardarVideo(blob).then(() => setMensaje("Video guardado localmente. Puedes exportarlo para reconstrucción 3D."))
          .catch(() => setMensaje("Video capturado, pero no se pudo guardar. Expórtalo antes de salir."));
      };
      recorder.start(1000);
      inicio.current = Date.now();
      setDuracion(0);
      reloj.current = window.setInterval(() => setDuracion(Math.floor((Date.now() - inicio.current) / 1000)), 1000);
      setGrabando(true);
      setMensaje("Grabando video continuo. Recorre lentamente toda la superficie.");
    } catch (error) {
      cerrarCamara();
      setMensaje(error instanceof Error ? error.message : "No se pudo iniciar la cámara.");
    } finally { setPreparando(false); }
  }
  function detener() {
    const r = grabador.current;
    if (r?.state === "recording") {
      setMensaje("Finalizando y guardando el video…");
      r.stop();
    }
  }
  function exportar() {
    if (!video) return;
    const url = URL.createObjectURL(video);
    if (urlActual.current) URL.revokeObjectURL(urlActual.current);
    urlActual.current = url;
    const a = document.createElement("a");
    a.href = url;
    const ext = video.type.includes("webm") ? "webm" : "mp4";
    const nombre = (labor.trim() || "levantamiento").replace(/[^a-zA-Z0-9_-]/g, "_");
    a.download = `escaneo_${nombre}_${tipo}_${new Date().toISOString().slice(0,10)}.${ext}`;
    a.click();
  }

  return (
    <div className="photogrammetry-workspace space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="max-w-2xl">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">02 · LEVANTAMIENTO</p>
          <h2 className="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Escaneo 3D · Fotogrametría</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Captura continua por video, sin internet. El video es la entrada para el futuro motor de reconstrucción multivista.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-[11px] font-semibold text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" /> Archivo local · Video original
        </span>
      </header>

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]">
        <div className="min-w-0 space-y-5">
          <div className="rounded-[1.5rem] border border-white/5 bg-white/[0.025] p-1.5">
            <section aria-labelledby="capture-data-title" className="space-y-5 rounded-[1.1rem] bg-card p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-display text-lg font-semibold text-primary" aria-hidden="true">01</span>
                <h3 id="capture-data-title" className="font-display text-xl font-bold uppercase">Datos del levantamiento</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <label className="block space-y-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Labor / objeto
                  <input value={labor} onChange={e => setLabor(e.target.value)} placeholder="Ej. Galería 120 o caja de prueba" className="h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base font-medium normal-case tracking-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="block space-y-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nivel
                  <input value={nivel} onChange={e => setNivel(e.target.value)} placeholder="Opcional para prueba" className="h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base font-medium normal-case tracking-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
              </div>
              <label className="block space-y-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Momento del levantamiento
                <select value={tipo} onChange={e => setTipo(e.target.value as "antes" | "despues")} className="h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base font-medium normal-case tracking-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                  <option value="antes">Antes del shotcrete</option><option value="despues">Después del shotcrete</option>
                </select>
              </label>
            </section>
          </div>
          <aside className="rounded-2xl border border-primary/10 bg-primary/[0.035] p-5">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg>
              Captura de video
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">El modelo 3D todavía no se genera aquí. Para una reconstrucción fiable usaremos un motor multivista, como COLMAP, que procesará el video exportado en PC. La cubicación existente no se modifica.</p>
          </aside>
        </div>

        <div className="min-w-0 rounded-[1.5rem] border border-white/5 bg-white/[0.025] p-1.5">
          <section aria-labelledby="camera-title" className="overflow-hidden rounded-[1.1rem] bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">CAPTURA CONTINUA</p>
                <h3 id="camera-title" className="font-display text-xl font-bold uppercase">Cámara · Escaneo continuo</h3>
              </div>
              <span className="rounded-lg bg-background px-3 py-2 font-mono text-sm tabular-nums text-foreground" aria-label={`Duración de grabación: ${duracion} segundos`}>{Math.floor(duracion/60).toString().padStart(2,"0")}:{(duracion%60).toString().padStart(2,"0")}</span>
            </div>
            <div className="relative mx-3 overflow-hidden rounded-xl bg-[#0a0e13] sm:mx-4">
              <video ref={vista} playsInline muted autoPlay aria-label="Vista de la cámara para captura continua" className="aspect-video w-full object-cover" />
              {!grabando && !preparando && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <span className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.025]">
                    <svg className="size-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3" /><path d="m15 10 6-3v10l-6-3" /></svg>
                  </span>
                  <div><p className="text-sm font-semibold text-foreground">Vista de cámara</p><p className="mt-1 text-xs text-muted-foreground">Inicia el escaneo para activar la captura</p></div>
                </div>
              )}
              {preparando && <p className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center text-sm text-muted-foreground" role="status">Preparando la cámara…</p>}
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                <span className={`size-1.5 rounded-full ${grabando ? "bg-red-400" : "bg-white/40"}`} aria-hidden="true" />
                {grabando ? "Grabación activa" : "Cámara detenida"}
              </div>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={grabando || preparando} onClick={() => void iniciar()} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-xs font-bold tracking-wide text-primary-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 sm:text-sm">
                  <span className="size-2 shrink-0 rounded-full bg-current" aria-hidden="true" /> INICIAR ESCANEO
                </button>
                <button type="button" disabled={!grabando} onClick={detener} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-input bg-secondary px-3 py-3 text-xs font-bold tracking-wide text-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent active:scale-[0.98] disabled:opacity-40 sm:text-sm">
                  <span className="size-2 shrink-0 rounded-[1px] bg-current" aria-hidden="true" /> DETENER
                </button>
              </div>
              <p role="status" className="rounded-xl bg-background/60 px-4 py-3 text-sm leading-relaxed text-foreground">{mensaje}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">Se registra el video completo, no solo 30 fotografías. Mantén abierta la aplicación durante la grabación. Los videos largos pueden superar el almacenamiento del navegador.</p>
            </div>
          </section>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-white/5 bg-white/[0.025] p-1.5">
        <section aria-labelledby="capture-result-title" className="flex flex-col gap-5 rounded-[1.1rem] bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground" aria-hidden="true">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 14h6M9 17h4" /></svg>
            </span>
            <div>
              <h3 id="capture-result-title" className="font-display text-xl font-bold uppercase">Resultado de captura</h3>
              <p className="mt-1 text-sm text-muted-foreground">{video ? `Video disponible: ${(video.size / 1048576).toFixed(1)} MB` : "Todavía no hay un video capturado."}</p>
            </div>
          </div>
          <button type="button" disabled={!video || grabando} onClick={exportar} className="flex min-h-12 w-full shrink-0 items-center justify-center gap-3 rounded-xl border border-input bg-secondary px-5 py-3 text-xs font-bold tracking-wide text-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent active:scale-[0.98] disabled:opacity-40 sm:w-auto">
            EXPORTAR VIDEO ORIGINAL
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" /></svg>
          </button>
        </section>
      </div>
    </div>
  );
}
