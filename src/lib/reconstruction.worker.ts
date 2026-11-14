import cvModule from "@techstark/opencv-js";
import { reconstructImages, type CvRuntime } from "./reconstruction-engine";
import type { ReconstructionImage, ReconstructionMessage } from "./reconstruction-types";

const send = (message: ReconstructionMessage) => self.postMessage(message);
async function initialize(): Promise<{ cv: CvRuntime }> {
  const runtime = cvModule as CvRuntime & {
    onRuntimeInitialized?: () => void;
    onAbort?: (reason: unknown) => void;
  };
  // OpenCV 4.x exports a custom thenable; never await/resolve it directly.
  if (runtime.Mat) return { cv: runtime };
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            "No se pudo iniciar el motor de reconstrucción. Recarga la aplicación con conexión y vuelve a intentarlo.",
          ),
        ),
      45_000,
    );
    runtime.onRuntimeInitialized = () => {
      clearTimeout(timeout);
      resolve();
    };
    runtime.onAbort = () => {
      clearTimeout(timeout);
      reject(new Error("El motor se quedó sin recursos. Prueba con menos fotografías."));
    };
  });
  return { cv: runtime };
}
self.onmessage = async (event: MessageEvent<{ images: ReconstructionImage[] }>) => {
  try {
    send({
      type: "progress",
      progress: { percent: 13, message: "Iniciando motor de reconstrucción…" },
    });
    const { cv } = await initialize();
    const result = reconstructImages(cv, event.data.images, (progress) =>
      send({ type: "progress", progress }),
    );
    send({ type: "result", result });
  } catch (error) {
    send({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo reconstruir la zona con estas fotos. Prueba con imágenes más nítidas y solapadas.",
    });
  }
};
