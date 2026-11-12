import { useEffect, useRef, useState } from "react";
import { Camera, Download, Images, Trash2 } from "lucide-react";

type Photo = { id: string; blob: Blob; name: string };
const DB = "shotcrete-fotos-levantamiento";
const STORE = "capturas";
const KEY = "levantamiento-actual";

function dbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readDraft(): Promise<Photo[]> {
  const db = await dbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as Photo[] | undefined) ?? []);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function saveDraft(photos: Photo[]) {
  const db = await dbOpen();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(photos, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function thumbnail(blob: Blob, maxSize = 280): Promise<string> {
  const image = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.75);
  } finally { image.close(); }
}

// Comparación local por puntos de alto contraste. Es una comprobación de
// solapamiento, no una reconstrucción 3D ni una medición métrica.
async function describe(blob: Blob): Promise<number[]> {
  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(image, 0, 0, 64, 64);
    const rgba = ctx.getImageData(0, 0, 64, 64).data;
    const gray = new Float32Array(4096);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = (rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114) / 255;
    }
    const features: number[] = [];
    // Descriptor espacial de gradientes: 8x8 celdas, independiente del color.
    for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {
      let sx = 0, sy = 0;
      for (let y = gy * 8 + 1; y < gy * 8 + 7; y++) for (let x = gx * 8 + 1; x < gx * 8 + 7; x++) {
        const dx = gray[y * 64 + x + 1] - gray[y * 64 + x - 1];
        const dy = gray[(y + 1) * 64 + x] - gray[(y - 1) * 64 + x];
        sx += Math.abs(dx); sy += Math.abs(dy);
      }
      features.push(sx, sy);
    }
    const norm = Math.hypot(...features) || 1;
    return features.map(v => v / norm);
  } finally { image.close(); }
}
function similarity(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function Fotogrametria() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Toma fotos consecutivas con bastante superposición.");
  const [scores, setScores] = useState<number[]>([]);
  const [labor, setLabor] = useState("");
  const [nivel, setNivel] = useState("");
  const [momento, setMomento] = useState<"antes" | "despues">("antes");
  const [distancia, setDistancia] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let active = true;
    void readDraft().then(data => { if (active) { setPhotos(data); setReady(true); loaded.current = true; } })
      .catch(() => { if (active) { setReady(true); loaded.current = true; setMessage("No se pudo recuperar el borrador anterior."); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    void saveDraft(photos).catch(() => setMessage("No se pudo guardar. Exporta las fotos para no perderlas."));
  }, [photos]);
  useEffect(() => {
    let active = true;
    void Promise.all(photos.map(p => thumbnail(p.blob).catch(() => ""))).then(images => {
      if (active) setPreviews(images);
    });
    return () => { active = false; };
  }, [photos]);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const images = Array.from(files).filter(file => file.type.startsWith("image/"));
    if (!images.length) { setMessage("Selecciona fotografías válidas."); return; }
    const newPhotos = images.slice(0, Math.max(0, 80 - photos.length)).map((file, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
      blob: file as Blob, name: file.name,
    }));
    setPhotos(previous => [...previous, ...newPhotos]);
    setScores([]);
    setMessage(`${newPhotos.length} foto(s) añadida(s). Mantén el orden del recorrido.`);
  }

  async function checkOverlap() {
    if (photos.length < 3) { setMessage("Añade al menos 3 fotografías consecutivas."); return; }
    setBusy(true);
    setMessage("Analizando textura y continuidad entre fotos en este dispositivo…");
    try {
      const descriptors = await Promise.all(photos.map(p => describe(p.blob)));
      const values = descriptors.slice(1).map((d, i) => similarity(descriptors[i], d));
      setScores(values);
      setMessage("Análisis orientativo listo. No equivale a una nube 3D.");
    } catch {
      setMessage("No se pudieron analizar algunas fotos. Prueba con imágenes JPG.");
    } finally { setBusy(false); }
  }

  function exportManifest() {
    const info = {
      proyecto: "Shotcrete Calc Pro V3", labor, nivel, momento,
      distanciaReferenciaMetros: Number(distancia) || null,
      advertencia: "Fotografías originales para reconstrucción multivista externa. Sin nube 3D ni escala calculada.",
      imagenes: photos.map((p, i) => ({ orden: i + 1, archivo: p.name, tipo: p.blob.type })),
      similitudOrientativa: scores,
    };
    saveBlob(new Blob([JSON.stringify(info, null, 2)], { type: "application/json" }), "levantamiento_datos.json");
  }
  function exportPhotos() {
    photos.forEach((photo, i) => {
      window.setTimeout(() => saveBlob(photo.blob, `foto_${String(i + 1).padStart(3, "0")}.${photo.blob.type.includes("png") ? "png" : "jpg"}`), i * 180);
    });
    setMessage("Descarga iniciada. El navegador puede solicitar permiso para varios archivos.");
  }

  return <main className="mx-auto max-w-3xl space-y-4 pb-8">
    <header>
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Levantamiento fotográfico</p>
      <h2 className="mt-1 text-2xl font-bold">Fotogrametría</h2>
      <p className="mt-2 text-sm text-muted-foreground">Captura sencilla, ordenada y sin internet. Las fotos se guardan en este dispositivo.</p>
    </header>
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">Labor
          <input className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" value={labor} onChange={e => setLabor(e.target.value)} placeholder="Ej. SN 120" />
        </label>
        <label className="text-sm font-semibold">Nivel
          <input className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" value={nivel} onChange={e => setNivel(e.target.value)} placeholder="Opcional" />
        </label>
      </div>
      <label className="block text-sm font-semibold">Momento
        <select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3" value={momento} onChange={e => setMomento(e.target.value as "antes" | "despues")}>
          <option value="antes">Antes del shotcrete</option><option value="despues">Después del shotcrete</option>
        </select>
      </label>
      <label className="block text-sm font-semibold">Distancia de referencia (m) · opcional
        <input className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" inputMode="decimal" value={distancia} onChange={e => setDistancia(e.target.value)} placeholder="Ej. 1.00" />
      </label>
    </section>
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="text-base font-bold">1. Captura las superficies</h3>
      <p className="text-sm text-muted-foreground">Avanza despacio desde un hastial hacia corona, tope y el otro hastial. Procura que cada imagen comparta gran parte de la escena con la siguiente; evita fotos movidas y zonas oscuras.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => cameraRef.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-2 text-sm font-bold text-primary-foreground"><Camera className="size-4" />Tomar foto</button>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-2 text-sm font-bold"><Images className="size-4" />Galería</button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void add(e.target.files); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { void add(e.target.files); e.target.value = ""; }} />
      <p className="text-sm font-semibold">{ready ? `${photos.length} fotografías` : "Recuperando fotografías…"}</p>
      {photos.length > 0 && <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => <div key={p.id} className="relative overflow-hidden rounded-lg border border-border bg-secondary">
          {previews[i] ? <img src={previews[i]} alt={`Foto ${i + 1}`} className="aspect-square w-full object-cover" /> : <div className="aspect-square" />}
          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-xs text-white">{i + 1}</span>
          <button type="button" aria-label={`Eliminar foto ${i + 1}`} onClick={() => { setPhotos(v => v.filter(x => x.id !== p.id)); setScores([]); }} className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white"><Trash2 className="size-4" /></button>
        </div>)}
      </div>}
    </section>
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="text-base font-bold">2. Revisa las fotografías</h3>
      <button type="button" disabled={busy || photos.length < 3} onClick={() => void checkOverlap()} className="min-h-12 w-full rounded-lg bg-primary px-3 font-bold text-primary-foreground disabled:opacity-50">{busy ? "Analizando…" : "Comprobar continuidad"}</button>
      {scores.length > 0 && <p className="text-sm">Pares consecutivos revisados: <strong>{scores.length}</strong>. La similitud de textura es solo una orientación: no confirma correspondencias geométricas.</p>}
      <p role="status" className="text-sm text-muted-foreground">{message}</p>
    </section>
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="text-base font-bold">3. Guarda tu levantamiento</h3>
      <button type="button" disabled={!photos.length} onClick={exportPhotos} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary font-bold disabled:opacity-50"><Download className="size-4" />Exportar fotos originales</button>
      <button type="button" disabled={!photos.length} onClick={exportManifest} className="min-h-11 w-full rounded-lg border border-border px-3 font-semibold disabled:opacity-50">Exportar datos del levantamiento</button>
      <p className="text-xs text-muted-foreground">Esta etapa organiza y comprueba las capturas sin conexión. Todavía no reconstruye una nube de puntos 3D: para ello falta integrar y validar un motor multivista. La distancia indicada no establece una escala automática. Los cálculos de shotcrete permanecen independientes.</p>
    </section>
  </main>;
}
