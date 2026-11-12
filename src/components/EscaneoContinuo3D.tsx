import { useEffect, useRef, useState } from "react";

type Props = { onFotogramas: (fotos: File[]) => void; disponibles: number };
const INTERVALO_MS = 650;
const MAX_LADO = 960;

/** Primera etapa del escáner: captura de cámara en vivo, sin servidor. */
export function EscaneoContinuo3D({ onFotogramas, disponibles }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const ocupadoRef = useRef(false);
  const fotosRef = useRef<File[]>([]);
  const [activo, setActivo] = useState(false);
  const [cantidad, setCantidad] = useState(0);
  const [mensaje, setMensaje] = useState("Cámara apagada. Inicia el escaneo para capturar fotogramas en vivo.");

  function detener(guardar: boolean) {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActivo(false);
    const fotos = fotosRef.current;
    fotosRef.current = [];
    ocupadoRef.current = false;
    if (guardar && fotos.length) {
      onFotogramas(fotos);
      setMensaje(`Escaneo detenido: ${fotos.length} fotogramas guardados. Analízalos en Puntos comunes del recorrido.`);
    } else {
      setMensaje(guardar ? "No se capturaron fotogramas." : "Escaneo cancelado.");
    }
  }

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  async function iniciar() {
    if (activo || ocupadoRef.current) return;
    if (disponibles < 2) {
      setMensaje("Libera espacio en Fotografías: este piloto admite 30 imágenes por levantamiento.");
      return;
    }
    ocupadoRef.current = true;
    setMensaje("Solicitando acceso a la cámara…");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Esta cámara necesita HTTPS y un navegador compatible.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(track => track.stop()); throw new Error("Vista de cámara no disponible."); }
      video.srcObject = stream;
      await video.play();
      fotosRef.current = [];
      setCantidad(0);
      setActivo(true);
      setMensaje("Escaneando en vivo. Muévete lentamente; la reconstrucción 3D aún no es en tiempo real.");
      const canvas = document.createElement("canvas");
      timerRef.current = window.setInterval(() => {
        if (!video.videoWidth || !video.videoHeight || ocupadoRef.current) return;
        if (fotosRef.current.length >= disponibles) {
          detener(true);
          return;
        }
        ocupadoRef.current = true;
        const factor = Math.min(1, MAX_LADO / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * factor);
        canvas.height = Math.round(video.videoHeight * factor);
        const ctx = canvas.getContext("2d");
        if (!ctx) { ocupadoRef.current = false; detener(true); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (blob && streamRef.current) {
            const numero = fotosRef.current.length + 1;
            fotosRef.current.push(new File([blob], `escaneo-${String(numero).padStart(3, "0")}.jpg`, { type: "image/jpeg" }));
            setCantidad(numero);
            if (numero >= disponibles) { detener(true); return; }
          }
          ocupadoRef.current = false;
        }, "image/jpeg", 0.82);
      }, INTERVALO_MS);
      ocupadoRef.current = false;
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      ocupadoRef.current = false;
      setMensaje(error instanceof Error ? error.message : "No se pudo iniciar la cámara.");
    }
  }

  return <section className="space-y-3 rounded-xl border border-primary/40 bg-card p-4">
    <h3 className="font-bold uppercase">Escaneo 3D continuo · etapa 1</h3>
    <p className="text-sm text-muted-foreground">Cámara en vivo y captura automática local. Por ahora almacena hasta {disponibles} fotogramas; todavía no construye una nube 3D en directo.</p>
    <video ref={videoRef} muted playsInline autoPlay className="aspect-video w-full rounded-lg bg-black object-cover" />
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => void iniciar()} disabled={activo || disponibles < 2}
        className="min-h-12 rounded-lg bg-primary p-2 font-bold text-primary-foreground disabled:opacity-50">INICIAR ESCANEO</button>
      <button type="button" onClick={() => detener(true)} disabled={!activo}
        className="min-h-12 rounded-lg border p-2 font-bold disabled:opacity-50">DETENER Y GUARDAR</button>
    </div>
    <p role="status" className="text-sm">{mensaje}</p>
    <p className="text-sm font-semibold">Fotogramas capturados: {cantidad} / {disponibles}</p>
    <p className="text-xs text-muted-foreground">Para una nube continua y cientos de fotogramas hace falta un motor multivista y almacenamiento separado; esta etapa prueba primero el acceso a cámara y la captura sostenida en Safari.</p>
  </section>;
}
