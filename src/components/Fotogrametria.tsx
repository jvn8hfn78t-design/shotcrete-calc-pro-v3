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

  return <div className="mx-auto max-w-3xl space-y-5">
    <header className="space-y-2">
      <h2 className="text-2xl font-black uppercase">Escaneo 3D · Fotogrametría</h2>
      <p className="text-sm text-muted-foreground">Captura continua por video, sin internet. El video es la entrada para el futuro motor de reconstrucción multivista.</p>
    </header>
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Labor / objeto
          <input value={labor} onChange={e => setLabor(e.target.value)} placeholder="Ej. Galería 120 o caja de prueba" className="h-11 w-full rounded-lg border bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">Nivel
          <input value={nivel} onChange={e => setNivel(e.target.value)} placeholder="Opcional para prueba" className="h-11 w-full rounded-lg border bg-background px-3" />
        </label>
      </div>
      <label className="block space-y-1 text-sm">Momento del levantamiento
        <select value={tipo} onChange={e => setTipo(e.target.value as "antes" | "despues")} className="h-11 w-full rounded-lg border bg-background px-3">
          <option value="antes">Antes del shotcrete</option><option value="despues">Después del shotcrete</option>
        </select>
      </label>
    </section>
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="font-bold uppercase">Cámara · Escaneo continuo</h3>
      <video ref={vista} playsInline muted autoPlay className="aspect-video w-full rounded-lg bg-black object-cover" />
      <div className="flex items-center justify-between text-sm">
        <span>{grabando ? "● Grabación activa" : "Cámara detenida"}</span>
        <span className="font-mono">{Math.floor(duracion/60).toString().padStart(2,"0")}:{(duracion%60).toString().padStart(2,"0")}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={grabando || preparando} onClick={() => void iniciar()} className="min-h-14 rounded-lg bg-primary p-2 font-bold text-primary-foreground disabled:opacity-50">INICIAR ESCANEO</button>
        <button type="button" disabled={!grabando} onClick={detener} className="min-h-14 rounded-lg border p-2 font-bold disabled:opacity-50">DETENER</button>
      </div>
      <p role="status" className="text-sm">{mensaje}</p>
      <p className="text-xs text-muted-foreground">Se registra el video completo, no solo 30 fotografías. Mantén abierta la aplicación durante la grabación. Los videos largos pueden superar el almacenamiento del navegador.</p>
    </section>
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="font-bold uppercase">Resultado de captura</h3>
      <p className="text-sm">{video ? `Video disponible: ${(video.size / 1048576).toFixed(1)} MB` : "Todavía no hay un video capturado."}</p>
      <button type="button" disabled={!video || grabando} onClick={exportar} className="min-h-12 w-full rounded-lg border p-2 font-bold disabled:opacity-50">EXPORTAR VIDEO ORIGINAL</button>
      <p className="text-xs text-muted-foreground">El modelo 3D todavía no se genera aquí. Para una reconstrucción fiable usaremos un motor multivista, como COLMAP, que procesará el video exportado en PC. La cubicación existente no se modifica.</p>
    </section>
  </div>;
}
