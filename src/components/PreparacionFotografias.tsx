import { useEffect, useRef, useState } from "react";

type FotoEntrada = {
  id: string;
  file: Blob;
};

type Resultado = {
  id: string;
  nombre: string;
  detalle: string;
};

type RespuestaWorker = {
  pixeles: number;
  media: number;
  minimo: number;
  maximo: number;
};

const LADO_MAXIMO = 640;

// El Worker se crea desde código incluido en la aplicación.
// No descarga scripts ni utiliza servicios externos.
const CODIGO_WORKER = `
self.onmessage = (event) => {
  const datos = new Uint8ClampedArray(event.data);
  const pixeles = datos.length / 4;

  let suma = 0;
  let minimo = 255;
  let maximo = 0;

  for (let i = 0; i < datos.length; i += 4) {
    const gris = Math.round(
      0.299 * datos[i] +
      0.587 * datos[i + 1] +
      0.114 * datos[i + 2]
    );

    suma += gris;
    minimo = Math.min(minimo, gris);
    maximo = Math.max(maximo, gris);
  }

  self.postMessage({
    pixeles,
    media: pixeles ? suma / pixeles : 0,
    minimo,
    maximo,
  });
};
`;

function procesarPixeles(
  worker: Worker,
  datos: Uint8ClampedArray,
): Promise<RespuestaWorker> {
  return new Promise((resolve, reject) => {
    const limpiar = () => {
      window.clearTimeout(temporizador);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    };

    const temporizador = window.setTimeout(() => {
      limpiar();
      reject(new Error("El procesamiento superó los 20 segundos."));
    }, 20_000);

    worker.onmessage = (event: MessageEvent<RespuestaWorker>) => {
      limpiar();
      resolve(event.data);
    };

    worker.onerror = () => {
      limpiar();
      reject(new Error("No se pudo ejecutar el Web Worker."));
    };

    worker.onmessageerror = () => {
      limpiar();
      reject(new Error("No se pudo leer la respuesta del Worker."));
    };

    try {
      // Transfiere este búfer temporal; el archivo original no se modifica.
      worker.postMessage(datos.buffer, [datos.buffer]);
    } catch (error) {
      limpiar();
      reject(error);
    }
  });
}

function reducirDosPorDos(origen: Uint8ClampedArray, ancho: number, alto: number) {
  const destino = new Uint8ClampedArray(ancho * alto * 4);
  const paso = 2 * ancho * 4;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const inicio = 2 * y * paso + 8 * x;
      for (let c = 0; c < 4; c++) {
        const i = inicio + c;
        const superior = Math.round((origen[i] + origen[i + 4]) / 2);
        const inferior = Math.round((origen[i + paso] + origen[i + paso + 4]) / 2);
        destino[4 * (y * ancho + x) + c] = Math.round((superior + inferior) / 2);
      }
    }
  }
  return destino;
}

export async function leerFoto(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const imagen = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      imagen.onload = () => resolve();
      imagen.onerror = () =>
        reject(new Error("Safari no pudo decodificar esta fotografía."));
      imagen.src = url;
    });

    const anchoOriginal = imagen.naturalWidth;
    const altoOriginal = imagen.naturalHeight;

    if (!anchoOriginal || !altoOriginal) {
      throw new Error("La fotografía no tiene dimensiones válidas.");
    }

    const factor = Math.min(
      1,
      LADO_MAXIMO / Math.max(anchoOriginal, altoOriginal),
    );

    const ancho = Math.max(1, Math.round(anchoOriginal * factor));
    const alto = Math.max(1, Math.round(altoOriginal * factor));

    const canvas = document.createElement("canvas");
    const doble = anchoOriginal >= 2 * ancho && altoOriginal >= 2 * alto;
    canvas.width = doble ? 2 * ancho : ancho;
    canvas.height = doble ? 2 * alto : alto;

    try {
      const contexto = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!contexto) {
        throw new Error("No se pudo preparar el lienzo de procesamiento.");
      }

      contexto.imageSmoothingEnabled = true;
      contexto.imageSmoothingQuality = "high";
      contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);
      const rgba = contexto.getImageData(0, 0, canvas.width, canvas.height).data;

      return {
        ancho,
        alto,
        anchoOriginal,
        altoOriginal,
        datos: doble ? reducirDosPorDos(rgba, ancho, alto) : rgba,
      };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    imagen.onload = null;
    imagen.onerror = null;
    imagen.src = "";
    URL.revokeObjectURL(url);
  }
}

export function PreparacionFotografias({
  fotos,
}: {
  fotos: readonly FotoEntrada[];
}) {
  const [ejecutando, setEjecutando] = useState(false);
  const [mensaje, setMensaje] = useState("Prueba pendiente.");
  const [resultados, setResultados] = useState<Resultado[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const activoRef = useRef(false);
  const ocupadoRef = useRef(false);

  useEffect(() => {
    activoRef.current = true;

    return () => {
      activoRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const ejecutar = async () => {
    if (ocupadoRef.current || fotos.length === 0) return;

    ocupadoRef.current = true;
    setEjecutando(true);
    setResultados([]);
    setMensaje("Comprobando el procesamiento local...");

    // Mantiene una lista fija durante esta ejecución.
    const lote = fotos.map(foto => ({ id: foto.id, file: foto.file }));
    let worker: Worker | null = null;
    let correctas = 0;

    try {
      const url = URL.createObjectURL(
        new Blob([CODIGO_WORKER], { type: "text/javascript" }),
      );

      try {
        worker = new Worker(url);
      } finally {
        URL.revokeObjectURL(url);
      }

      workerRef.current = worker;

      // Comprobación conocida: un píxel negro y uno blanco.
      const prueba = await procesarPixeles(
        worker,
        new Uint8ClampedArray([
          0, 0, 0, 255,
          255, 255, 255, 255,
        ]),
      );

      if (
        prueba.pixeles !== 2 ||
        prueba.media !== 127.5 ||
        prueba.minimo !== 0 ||
        prueba.maximo !== 255
      ) {
        throw new Error("Falló la comprobación de píxeles conocidos.");
      }

      for (let index = 0; index < lote.length; index++) {
        if (!activoRef.current) return;

        const foto = lote[index];
        let detalle: string;

        setMensaje(`Procesando fotografía ${index + 1} de ${lote.length}...`);

        try {
          const imagen = await leerFoto(foto.file);
          if (!activoRef.current) return;

          const resultado = await procesarPixeles(worker, imagen.datos);
          if (!activoRef.current) return;

          if (resultado.pixeles !== imagen.ancho * imagen.alto) {
            throw new Error("La cantidad de píxeles recibida no coincide.");
          }

          correctas++;

          detalle =
            `${imagen.anchoOriginal} × ${imagen.altoOriginal} → ` +
            `${imagen.ancho} × ${imagen.alto}. ` +
            `${resultado.pixeles.toLocaleString("es-PE")} píxeles. ` +
            `Gris medio: ${resultado.media.toFixed(1)} / 255.`;
        } catch (error) {
          detalle =
            error instanceof Error
              ? error.message
              : "No se pudo procesar esta fotografía.";
        }

        if (!activoRef.current) return;

        setResultados(actuales => [
          ...actuales,
          {
            id: foto.id,
            nombre: `Foto ${index + 1}`,
            detalle,
          },
        ]);
      }

      if (activoRef.current) {
        setMensaje(
          `Control negro/blanco correcto. ` +
          `${correctas}/${lote.length} fotografías procesadas localmente.`,
        );
      }
    } catch (error) {
      if (activoRef.current) {
        setMensaje(
          error instanceof Error
            ? error.message
            : "No se pudo iniciar el procesamiento local.",
        );
      }
    } finally {
      worker?.terminate();
      workerRef.current = null;
      ocupadoRef.current = false;

      if (activoRef.current) {
        setEjecutando(false);
      }
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <h3 className="font-bold uppercase">
        Preparación local de fotografías
      </h3>

      <p className="text-sm text-muted-foreground">
        Lee las fotografías actuales y procesa una versión temporal de
        hasta 640 píxeles por lado mayor. Conserva los originales.
      </p>

      <button
        type="button"
        onClick={() => void ejecutar()}
        disabled={ejecutando || fotos.length === 0}
        className="h-12 w-full rounded-lg bg-primary px-3 font-bold text-primary-foreground disabled:opacity-50"
      >
        {ejecutando
          ? "PROCESANDO..."
          : `PROBAR ${fotos.length} FOTOGRAFÍAS`}
      </button>

      <p role="status" className="text-sm font-semibold">
        {mensaje}
      </p>

      {resultados.length > 0 && (
        <ul className="space-y-2">
          {resultados.map(resultado => (
            <li
              key={resultado.id}
              className="rounded-lg border border-border p-3"
            >
              <p className="text-sm font-bold">{resultado.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {resultado.detalle}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Los resultados corresponden a las fotos presentes al pulsar el
        botón. El gris medio describe luminosidad; no certifica nitidez,
        superposición ni calidad fotogramétrica. Esta prueba todavía no
        genera puntos 3D ni volúmenes. Mantén la aplicación en primer plano.
      </p>
    </section>
  );
}
