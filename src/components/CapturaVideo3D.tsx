import { useRef, useState } from "react";

type Props = { onFotogramas: (fotos: File[]) => void; disponibles: number };
const MAX_LADO = 1280;
const INTERVALO = 0.8;
const MAX_DURACION = 45;

export function CapturaVideo3D({ onFotogramas, disponibles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const grabarRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [estado, setEstado] = useState("Graba o selecciona un video corto recorriendo el objeto.");
  const ocupado = useRef(false);

  async function extraer(file: File) {
    if (ocupado.current) return;
    ocupado.current = true;
    setProcesando(true);
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const fotogramas: File[] = [];
    try {
      if (disponibles <= 0) throw new Error("No hay espacio para más fotografías (máximo 30).");
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("No se pudo abrir el video. Prueba con un video MP4 o MOV compatible con Safari."));
        video.load();
      });
      const duracion = video.duration;
      if (!Number.isFinite(duracion) || duracion <= 0) throw new Error("El video no tiene una duración válida.");
      const limite = Math.min(duracion, MAX_DURACION);
      const cantidad = Math.min(disponibles, Math.max(1, Math.floor(limite / INTERVALO)));
      const factor = Math.min(1, MAX_LADO / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * factor));
      canvas.height = Math.max(1, Math.round(video.videoHeight * factor));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo preparar el procesamiento local del video.");
      for (let i = 0; i < cantidad; i++) {
        setEstado(`Extrayendo fotograma ${i + 1} de ${cantidad}…`);
        const tiempo = Math.min(Math.max(0, duracion - 0.05), (i + 0.5) * limite / cantidad);
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => { limpiar(); reject(new Error("El video tardó demasiado en buscar un fotograma.")); }, 12000);
          const limpiar = () => { window.clearTimeout(timeout); video.onseeked = null; video.onerror = null; };
          video.onseeked = () => { limpiar(); resolve(); };
          video.onerror = () => { limpiar(); reject(new Error("Error al leer un fotograma del video.")); };
          video.currentTime = tiempo;
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo convertir el fotograma.")), "image/jpeg", 0.88);
        });
        fotogramas.push(new File([blob], `video-foto-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }));
      }
      canvas.width = 0;
      canvas.height = 0;
      onFotogramas(fotogramas);
      setEstado(`Listo: ${fotogramas.length} fotogramas extraídos localmente. Pulsa ANALIZAR RECORRIDO para procesarlos.`);
    } catch (error) {
      setEstado(error instanceof Error ? error.message : "No se pudo procesar el video.");
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (inputRef.current) inputRef.current.value = "";
      if (grabarRef.current) grabarRef.current.value = "";
      ocupado.current = false;
      setProcesando(false);
    }
  }

  return <section className="space-y-3 rounded-xl border border-border bg-card p-4">
    <h3 className="font-bold uppercase">Captura 3D por video · piloto</h3>
    <p className="text-sm text-muted-foreground">
      Graba un video corto desplazándote alrededor del objeto. El teléfono extraerá fotogramas
      sin subir el video a internet. Se usa el analizador fotogramétrico experimental existente.
    </p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button type="button" className="h-14 rounded-lg bg-primary px-3 font-bold text-primary-foreground disabled:opacity-50"
        disabled={procesando || disponibles === 0} onClick={() => grabarRef.current?.click()}>
        GRABAR VIDEO 3D
      </button>
      <button type="button" className="h-14 rounded-lg border border-border bg-secondary px-3 font-bold disabled:opacity-50"
        disabled={procesando || disponibles === 0} onClick={() => inputRef.current?.click()}>
        ELEGIR VIDEO DE GALERÍA
      </button>
    </div>
    <input ref={grabarRef} type="file" accept="video/*" capture="environment" hidden
      onChange={e => { const file = e.target.files?.[0]; if (file) void extraer(file); }} />
    <input ref={inputRef} type="file" accept="video/*" hidden
      onChange={e => { const file = e.target.files?.[0]; if (file) void extraer(file); }} />
    <p role="status" className="text-sm">{estado}</p>
    <p className="text-xs text-muted-foreground">
      Primeros 45 segundos, hasta {disponibles} fotogramas disponibles. La extracción no garantiza
      una nube 3D: requiere superposición, movimiento de cámara y detalles visibles.
      Mantén Safari abierto mientras procesa.
    </p>
  </section>;
}
