import { useRef, useState } from "react";

type Props = { onFotogramas: (fotos: File[]) => void; disponibles: number };
const MAX_LADO = 1280;
const INTERVALO = 0.8;
const MUESTRAS_POR_FOTO = 2;
const UMBRAL_REPETIDA = 2.2;
const MAX_DURACION = 45;

export function CapturaVideo3D({ onFotogramas, disponibles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const grabarRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [estado, setEstado] = useState("Graba o selecciona un video corto recorriendo el objeto.");
  const ocupado = useRef(false);

  function evaluar(ctx: CanvasRenderingContext2D, ancho: number, alto: number) {
    // Miniatura para puntuar nitidez y cambio visual sin guardar todos los fotogramas.
    const muestra = document.createElement("canvas");
    muestra.width = 64;
    muestra.height = Math.max(16, Math.round(64 * alto / ancho));
    const c = muestra.getContext("2d", { willReadFrequently: true });
    if (!c) throw new Error("No se pudo analizar la nitidez del video.");
    c.drawImage(ctx.canvas, 0, 0, muestra.width, muestra.height);
    const { data } = c.getImageData(0, 0, muestra.width, muestra.height);
    const gris = new Float32Array(muestra.width * muestra.height);
    for (let i = 0; i < gris.length; i++)
      gris[i] = (77 * data[4*i] + 150 * data[4*i+1] + 29 * data[4*i+2]) / 256;
    let energia = 0;
    for (let y = 1; y < muestra.height - 1; y++)
      for (let x = 1; x < muestra.width - 1; x++) {
        const i = y * muestra.width + x;
        const lap = 4 * gris[i] - gris[i-1] - gris[i+1] - gris[i-muestra.width] - gris[i+muestra.width];
        energia += lap * lap;
      }
    return { nitidez: energia / Math.max(1, (muestra.width-2)*(muestra.height-2)), gris };
  }

  function diferencia(a: Float32Array, b: Float32Array) {
    let total = 0;
    for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
    return total / Math.max(1, a.length);
  }

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
      const muestras = Math.min(90, cantidad * MUESTRAS_POR_FOTO);
      const factor = Math.min(1, MAX_LADO / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * factor));
      canvas.height = Math.max(1, Math.round(video.videoHeight * factor));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo preparar el procesamiento local del video.");
      let anterior: Float32Array | null = null;
      let omitidas = 0;
      let repetidas = 0;
      // Elegir el mejor fotograma de cada intervalo, comparando nitidez.
      for (let i = 0; i < cantidad; i++) {
        setEstado(`Evaluando tramo ${i + 1} de ${cantidad}…`);
        let mejor: { imagen: ImageData; gris: Float32Array; nitidez: number } | null = null;
        for (let k = 0; k < Math.ceil(muestras / cantidad); k++) {
        const tiempo = Math.min(Math.max(0, duracion - 0.05), (i + (k + 0.5) / Math.ceil(muestras / cantidad)) * limite / cantidad);
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => { limpiar(); reject(new Error("El video tardó demasiado en buscar un fotograma.")); }, 12000);
          const limpiar = () => { window.clearTimeout(timeout); video.onseeked = null; video.onerror = null; };
          video.onseeked = () => { limpiar(); resolve(); };
          video.onerror = () => { limpiar(); reject(new Error("Error al leer un fotograma del video.")); };
          video.currentTime = tiempo;
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const evaluacion = evaluar(ctx, canvas.width, canvas.height);
        if (!mejor || evaluacion.nitidez > mejor.nitidez)
          mejor = { imagen: ctx.getImageData(0, 0, canvas.width, canvas.height), ...evaluacion };
        }
        if (!mejor) { omitidas++; continue; }
        if (anterior && diferencia(anterior, mejor.gris) < UMBRAL_REPETIDA) {
          repetidas++;
          continue;
        }
        anterior = mejor.gris;
        ctx.putImageData(mejor.imagen, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo convertir el fotograma.")), "image/jpeg", 0.88);
        });
        fotogramas.push(new File([blob], `video-foto-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }));
      }
      canvas.width = 0;
      canvas.height = 0;
      if (!fotogramas.length) throw new Error("No se encontraron fotogramas suficientemente distintos. Repite el video moviéndote alrededor del objeto.");
      onFotogramas(fotogramas);
      setEstado(`Listo: ${fotogramas.length} fotogramas seleccionados por nitidez · ${repetidas} tramos similares descartados · ${omitidas} tramos sin imagen. Pulsa ANALIZAR RECORRIDO.`);
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
      Primeros 45 segundos, hasta {disponibles} fotogramas disponibles. Se prioriza la nitidez y se omiten tomas muy similares. La extracción no garantiza
      una nube 3D: requiere superposición, movimiento de cámara y detalles visibles.
      Mantén Safari abierto mientras procesa.
    </p>
  </section>;
}
