import type {
  ReconstructionImage,
  ReconstructionMessage,
  ReconstructionProgress,
  ReconstructionResult,
} from "./reconstruction-types";
export type {
  ReconstructionPoint,
  ReconstructionProgress,
  ReconstructionResult,
} from "./reconstruction-types";

const abortError = () => new DOMException("Reconstrucción cancelada", "AbortError");

async function decode(file: File, signal?: AbortSignal): Promise<ReconstructionImage> {
  if (signal?.aborted) throw abortError();
  if (file.size > 25 * 1024 * 1024)
    throw new Error(`${file.name}: usa una fotografía de menos de 25 MB.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`No se pudo abrir ${file.name}. Usa fotografías JPG, PNG o WebP.`);
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 60_000_000)
      throw new Error(`${file.name}: reduce la resolución de esta fotografía antes de continuar.`);
    const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * ratio),
      height = Math.round(bitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No se pudo preparar la fotografía en este dispositivo.");
    context.drawImage(bitmap, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    canvas.width = 0;
    canvas.height = 0;
    if (signal?.aborted) throw abortError();
    return { name: file.name, width, height, rgba };
  } finally {
    bitmap.close();
  }
}

export async function reconstructPhotos(
  files: File[],
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: ReconstructionProgress) => void;
  } = {},
): Promise<ReconstructionResult> {
  if (files.length < 3 || files.length > 12)
    throw new Error("Selecciona entre 3 y 12 fotografías de la misma zona.");
  if (options.signal?.aborted) throw abortError();
  const images: ReconstructionImage[] = [];
  for (const [index, file] of files.entries()) {
    options.onProgress?.({
      percent: Math.round((index / files.length) * 12),
      message: `Preparando fotografía ${index + 1} de ${files.length}…`,
    });
    images.push(await decode(file, options.signal));
  }
  if (options.signal?.aborted) throw abortError();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./reconstruction.worker.ts", import.meta.url), {
      type: "module",
    });
    let finished = false;
    const cleanup = () => {
      clearTimeout(timeout);
      worker.terminate();
      options.signal?.removeEventListener("abort", abort);
    };
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };
    const abort = () => fail(abortError());
    const timeout = setTimeout(
      () =>
        fail(
          new Error(
            "El procesamiento tardó demasiado. Prueba con menos fotos y cierra otras aplicaciones.",
          ),
        ),
      240_000,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () =>
      fail(
        new Error(
          "El motor no pudo ejecutarse. Vuelve a intentarlo con menos fotos o abre la aplicación en Chrome o Safari actualizado.",
        ),
      );
    worker.onmessage = (event: MessageEvent<ReconstructionMessage>) => {
      if (finished) return;
      const message = event.data;
      if (message.type === "progress") options.onProgress?.(message.progress);
      else if (message.type === "error") fail(new Error(message.message));
      else {
        finished = true;
        cleanup();
        resolve(message.result);
      }
    };
    worker.postMessage(
      { images },
      images.map((image) => image.rgba.buffer),
    );
  });
}

/** Relative units are explicit: exporting does not infer a metric scale. */
export function exportReconstructionPly(result: ReconstructionResult): string {
  const header = [
    "ply",
    "format ascii 1.0",
    "comment Shotcrete photogrammetry - relative scale, approximate intrinsics",
    `element vertex ${result.points.length}`,
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "end_header",
  ];
  return (
    header.join("\n") +
    "\n" +
    result.points
      .map((p) => `${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)} ${p.r} ${p.g} ${p.b}`)
      .join("\n") +
    "\n"
  );
}
