
import { useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  Ruler,
  Trash2,
  ScanLine,
  Info,
} from "lucide-react";

type Photo = {
  id: string;
  preview: string;
  file: File;
};

const MAX_PHOTOS = 30;

export function Fotogrametria() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [labor, setLabor] = useState("");
  const [nivel, setNivel] = useState("");
  const [zona, setZona] = useState("");
  const [scale, setScale] = useState("");
  const [unit, setUnit] = useState("cm");
  const [scaleDescription, setScaleDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;

    const available = MAX_PHOTOS - photos.length;
    const selected = Array.from(files)
      .filter(file => file.type.startsWith("image/"))
      .filter(file => file.size <= 25 * 1024 * 1024)
      .slice(0, available);

    const newPhotos = selected.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }));

    setPhotos(current => [...current, ...newPhotos]);

    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  };

  const removePhoto = (id: string) => {
    setPhotos(current => {
      const photo = current.find(item => item.id === id);
      if (photo) URL.revokeObjectURL(photo.preview);
      return current.filter(item => item.id !== id);
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <ScanLine className="size-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Nuevo módulo
            </p>
            <h2 className="text-2xl font-black uppercase">
              Fotogrametría
            </h2>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Levantamiento fotográfico para reconstrucción tridimensional
          y cubicación con geometría real.
        </p>
      </header>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex gap-2">
          <Info className="size-4 shrink-0 text-amber-500" />
          <p className="text-xs text-muted-foreground">
            Primera etapa: captura y registro de información.
            La reconstrucción 3D y los cálculos todavía no están implementados.
          </p>
        </div>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h3 className="font-bold uppercase">1. Datos del levantamiento</h3>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold">Labor</span>
            <input
              value={labor}
              onChange={e => setLabor(e.target.value)}
              placeholder="Ej. Galería 120"
              className="h-11 w-full rounded-lg border border-input bg-background px-3"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold">Nivel</span>
            <input
              value={nivel}
              onChange={e => setNivel(e.target.value)}
              placeholder="Ej. Nivel 180"
              className="h-11 w-full rounded-lg border border-input bg-background px-3"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold">Zona / progresiva</span>
            <input
              value={zona}
              onChange={e => setZona(e.target.value)}
              placeholder="Referencia de ubicación"
              className="h-11 w-full rounded-lg border border-input bg-background px-3"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-bold uppercase">2. Fotografías</h3>
          <span className="text-xs font-semibold text-muted-foreground">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          Captura fotografías desde diferentes posiciones, manteniendo
          superposición entre imágenes consecutivas.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex h-14 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground"
          >
            <Camera className="size-5" />
            TOMAR FOTOGRAFÍAS
          </button>

          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex h-14 items-center justify-center gap-2 rounded-lg border border-border bg-secondary font-bold"
          >
            <ImagePlus className="size-5" />
            ELEGIR DE GALERÍA
          </button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={e => addPhotos(e.target.files)}
        />

        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => addPhotos(e.target.files)}
        />

        {photos.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
            <ImagePlus className="mb-2 size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No hay fotografías agregadas
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((photo, index) => (
              <div key={photo.id} className="overflow-hidden rounded-lg border border-border">
                <img
                  src={photo.preview}
                  alt={`Fotografía ${index + 1}`}
                  className="aspect-square w-full object-cover"
                />
                <div className="flex items-center justify-between p-2">
                  <span className="text-xs font-semibold">
                    Foto {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    aria-label="Eliminar fotografía"
                    className="text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h3 className="flex items-center gap-2 font-bold uppercase">
          <Ruler className="size-5 text-primary" />
          3. Referencia de escala
        </h3>

        <p className="text-sm text-muted-foreground">
          Registrar una dimensión física conocida que aparezca
          en las fotografías y pueda verificarse en campo.
        </p>

        <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
          <label className="space-y-1">
            <span className="text-xs font-semibold">Longitud conocida</span>
            <input
              type="number"
              min="0"
              step="any"
              value={scale}
              onChange={e => setScale(e.target.value)}
              placeholder="Ej. 100"
              className="h-11 w-full rounded-lg border border-input bg-background px-3"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold">Unidad</span>
            <select
              value={unit}
              onChange={e => setUnit(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3"
            >
              <option value="mm">Milímetros</option>
              <option value="cm">Centímetros</option>
              <option value="m">Metros</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold">
            Descripción de la referencia
          </span>
          <input
            value={scaleDescription}
            onChange={e => setScaleDescription(e.target.value)}
            placeholder="Ej. Barra de escala de 1 metro"
            className="h-11 w-full rounded-lg border border-input bg-background px-3"
          />
        </label>

        <p className="text-xs text-muted-foreground">
          Este registro no calibra todavía ningún modelo 3D.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-secondary/50 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Resumen del levantamiento
        </h3>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Labor</p>
            <p className="font-semibold">{labor || "Pendiente"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Nivel</p>
            <p className="font-semibold">{nivel || "Pendiente"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fotografías</p>
            <p className="font-semibold">{photos.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Escala</p>
            <p className="font-semibold">
              {scale ? `${scale} ${unit}` : "Pendiente"}
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
