import { useEffect, useRef, useState } from "react";
import {
  guardarLevantamiento,
  obtenerLevantamiento,
  type LevantamientoGuardado,
  type EstacionGuardada,
  type GrupoCaptura,
} from "@/lib/fotogrametria-store";
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
  grupoCaptura?: GrupoCaptura;
  estacionId?: string;
};

const MAX_PHOTOS = 30;
const DISTANCIA_MAXIMA_ESTACIONES = 2.5;

function proponerEstaciones(longitud: number): EstacionGuardada[] {
  if (!Number.isFinite(longitud) || longitud <= 0) {
    return [];
  }

  const cantidadIntervalos = Math.ceil(
    longitud / DISTANCIA_MAXIMA_ESTACIONES,
  );

  return Array.from({ length: cantidadIntervalos + 1 }, (_, index) => {
    const progresiva = Number(
      ((longitud * index) / cantidadIntervalos).toFixed(2),
    );

    return {
      id: `estacion-${index + 1}`,
      nombre:
        index === 0
          ? "Inicio"
          : index === cantidadIntervalos
            ? "Final"
            : `Estación ${index}`,
      progresiva,
    };
  });
}

export function Fotogrametria() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [labor, setLabor] = useState("");
  const [nivel, setNivel] = useState("");
  const [zona, setZona] = useState("");
  const [longitudMetros, setLongitudMetros] = useState("");
  const [estaciones, setEstaciones] = useState<EstacionGuardada[]>([]);
  const [grupoCaptura, setGrupoCaptura] = useState<GrupoCaptura>("recorrido");
  const [estacionSeleccionada, setEstacionSeleccionada] = useState("");
  const [scale, setScale] = useState("");
  const [unit, setUnit] = useState("cm");
  const [scaleDescription, setScaleDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [datosCargados, setDatosCargados] = useState(false);

  const [estadoGuardado, setEstadoGuardado] = useState<
    "cargando" | "guardando" | "guardado" | "error"
  >("cargando");

  const fotosRef = useRef<Photo[]>([]);
  const colaGuardadoRef = useRef<Promise<void>>(Promise.resolve());

  const levantamientoRef = useRef<LevantamientoGuardado | null>(null);
  const datosListosRef = useRef(false);

  fotosRef.current = photos;
    const encolarGuardado = (
    levantamiento: LevantamientoGuardado,
    actualizarEstado = true,
  ) => {
    colaGuardadoRef.current = colaGuardadoRef.current
      .catch(() => undefined)
      .then(() => guardarLevantamiento(levantamiento))
      .then(() => {
        if (actualizarEstado) {
          setEstadoGuardado("guardado");
        }
      })
      .catch(error => {
        console.error("Error al guardar fotogrametría:", error);

        if (actualizarEstado) {
          setEstadoGuardado("error");
        }
      });

    return colaGuardadoRef.current;
  };
    useEffect(() => {
    let activo = true;

    const cargar = async () => {
      try {
        const guardado = await obtenerLevantamiento();

        if (!activo) return;

        if (guardado) {
                    setLabor(guardado.labor);
          setNivel(guardado.nivel);
          setZona(guardado.zona);

          const longitudGuardada = guardado.longitudMetros;

          setLongitudMetros(
            longitudGuardada !== undefined
              ? String(longitudGuardada)
              : "",
          );

          setEstaciones(
            guardado.estaciones ??
              (longitudGuardada
                ? proponerEstaciones(longitudGuardada)
                : []),
          );

          setScale(guardado.escala);
          setUnit(guardado.unidad);
          setScaleDescription(guardado.descripcionEscala);

          const fotosRecuperadas: Photo[] = guardado.fotos.map(foto => {
  const file = new File([foto.blob], foto.nombre, {
    type: foto.tipo,
  });

  return {
    id: foto.id,
    file,
    preview: URL.createObjectURL(foto.blob),
    grupoCaptura: foto.grupoCaptura ?? "recorrido",
    estacionId: foto.estacionId,
  };
});

setPhotos(fotosRecuperadas);
        }

        setEstadoGuardado("guardado");
      } catch (error) {
        console.error("Error al recuperar fotogrametría:", error);
        setEstadoGuardado("error");
      } finally {
        if (activo) {
          datosListosRef.current = true;
          setDatosCargados(true);
        }
      }
    };

    void cargar();

    return () => {
      activo = false;
    };
  }, []);
    useEffect(() => {
    if (!datosCargados) return;

        levantamientoRef.current = {
      id: "levantamiento-actual",
      labor,
      nivel,
      zona,
      tipoLevantamiento: "antes",
      longitudMetros:
        longitudMetros.trim() !== "" &&
        Number.isFinite(Number(longitudMetros)) &&
        Number(longitudMetros) > 0
          ? Number(longitudMetros)
          : undefined,
      estaciones,
      escala: scale,
      unidad: unit,
      descripcionEscala: scaleDescription,
      fotos: photos.map(photo => ({
  id: photo.id,
  nombre: photo.file.name,
  tipo: photo.file.type,
  blob: photo.file,
  grupoCaptura: photo.grupoCaptura ?? "recorrido",
  estacionId: photo.estacionId,
})),
      actualizadoEn: new Date().toISOString(),
    };
  }, [
    datosCargados,
    labor,
    nivel,
    zona,
    longitudMetros,
    estaciones,
    scale,
    unit,
    scaleDescription,
    photos,
  ]);
    useEffect(() => {
    if (!datosCargados) return;

    setEstadoGuardado("guardando");

    const temporizador = window.setTimeout(() => {
      const levantamiento = levantamientoRef.current;

      if (levantamiento) {
        void encolarGuardado(levantamiento);
      }
    }, 600);

    return () => {
      window.clearTimeout(temporizador);
    };
  }, [
    datosCargados,
    labor,
    nivel,
    zona,
    longitudMetros,
    estaciones,
    scale,
    unit,
    scaleDescription,
    photos,
  ]);
    useEffect(() => {
    return () => {
      if (!datosListosRef.current) return;

      const ultimoLevantamiento = levantamientoRef.current;

      if (ultimoLevantamiento) {
        void encolarGuardado(ultimoLevantamiento, false);
      }

      fotosRef.current.forEach(photo => {
        URL.revokeObjectURL(photo.preview);
      });
    };
  }, []);
  const addPhotos = (files: FileList | null) => {
  if (!files) return;

  const available = MAX_PHOTOS - photos.length;
  const selected = Array.from(files)
    .filter(file => file.type.startsWith("image/"))
    .filter(file => file.size <= 25 * 1024 * 1024)
    .slice(0, available);

  const newPhotos: Photo[] = selected.map(file => ({
    id: crypto.randomUUID(),
    file,
    preview: URL.createObjectURL(file),
    grupoCaptura,
    estacionId:
      grupoCaptura === "estacion"
        ? estacionSeleccionada
        : undefined,
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
                <p className="text-xs font-semibold text-muted-foreground">
          {estadoGuardado === "cargando" && "Recuperando levantamiento..."}
          {estadoGuardado === "guardando" && "Guardando datos y fotografías..."}
          {estadoGuardado === "guardado" && "✓ Datos guardados en este dispositivo"}
          {estadoGuardado === "error" &&
            "No se pudo guardar. Revisa el almacenamiento del dispositivo."}
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
        <h3 className="font-bold uppercase">
          2. Longitud y estaciones de control
        </h3>

        <p className="text-sm text-muted-foreground">
          Registra la longitud de la labor. La aplicación propondrá
          estaciones de control desde el inicio hasta el tope.
        </p>

        <label className="block max-w-sm space-y-1">
          <span className="text-xs font-semibold">
            Longitud total de la labor (metros)
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={longitudMetros}
            onChange={e => {
              const valor = e.target.value;
              setLongitudMetros(valor);

              const longitud = Number(valor);

              setEstaciones(
                valor.trim() !== "" &&
                  Number.isFinite(longitud) &&
                  longitud > 0
                  ? proponerEstaciones(longitud)
                  : [],
              );
            }}
            placeholder="Ej. 3.80"
            className="h-11 w-full rounded-lg border border-input bg-background px-3"
          />
        </label>

        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">
              Estaciones propuestas
            </p>
            <span className="text-xs font-semibold text-muted-foreground">
              {estaciones.length} puntos
            </span>
          </div>

          {estaciones.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Ingresa una longitud válida para generar las estaciones.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {estaciones.map(estacion => (
                <div
                  key={estacion.id}
                  className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2"
                >
                  <span className="text-sm font-semibold">
                    {estacion.nombre}
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {estacion.progresiva.toFixed(2)} m
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          La distribución es automática y utiliza intervalos máximos
          aproximados de 2.5 metros. Las estaciones son referencias
          de control para el levantamiento, no reemplazan el recorrido
          fotográfico continuo.
        </p>
      </section>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-bold uppercase">3. Fotografías</h3>
          <span className="text-xs font-semibold text-muted-foreground">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
  Selecciona el tipo de captura antes de tomar o elegir las fotografías.
  Mantén superposición entre imágenes consecutivas.
</p>

<div className="grid gap-3 sm:grid-cols-2">
  <label className="space-y-1">
    <span className="text-xs font-semibold">Tipo de captura</span>
    <select
      value={grupoCaptura}
      onChange={e => {
        setGrupoCaptura(e.target.value as GrupoCaptura);
        setEstacionSeleccionada("");
      }}
      className="h-11 w-full rounded-lg border border-input bg-background px-3"
    >
      <option value="recorrido">Recorrido continuo</option>
      <option value="estacion">Estación de control</option>
      <option value="sacrificio">Sacrificio (tope)</option>
    </select>
  </label>

  {grupoCaptura === "estacion" && (
    <label className="space-y-1">
      <span className="text-xs font-semibold">Estación</span>
      <select
        value={estacionSeleccionada}
        onChange={e => setEstacionSeleccionada(e.target.value)}
        className="h-11 w-full rounded-lg border border-input bg-background px-3"
      >
        <option value="">Seleccionar estación</option>
        {estaciones.map(estacion => (
          <option key={estacion.id} value={estacion.id}>
            {estacion.nombre} — {estacion.progresiva.toFixed(2)} m
          </option>
        ))}
      </select>
    </label>
  )}
</div>

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
          4. Referencia de escala
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
