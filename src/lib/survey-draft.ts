import type { ReconstructionResult } from "./reconstruction-types";

export type SurveyPhoto = { id: string; name: string; blob: Blob };
export type SurveyDraft = {
  name: string;
  photos: SurveyPhoto[];
  result: ReconstructionResult | null;
};
const DATABASE = "shotcrete-reconstruction-v1";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSurveyDraft(): Promise<SurveyDraft | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").get("current");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveSurveyDraft(draft: SurveyDraft): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put(draft, "current");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

/** Store bounded local copies; original files on the device remain intact. */
export async function prepareSurveyPhoto(file: File): Promise<SurveyPhoto> {
  if (file.size > 30 * 1024 * 1024) throw new Error(`${file.name}: la imagen supera 30 MB.`);
  if (!file.type.startsWith("image/"))
    throw new Error(`${file.name}: selecciona una imagen JPG, PNG o WebP.`);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error(`${file.name}: formato no compatible. Usa JPG, PNG o WebP.`);
    });
    const ratio = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la fotografía en este navegador.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("No se pudo preparar la imagen."))),
        "image/jpeg",
        0.94,
      ),
    );
    return { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, "") + ".jpg", blob };
  } finally {
    URL.revokeObjectURL(url);
  }
}
