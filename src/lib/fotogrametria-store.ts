
const DB_NAME = "shotcrete-calc-pro";
const DB_VERSION = 1;
const STORE_NAME = "levantamientos";
const DRAFT_KEY = "levantamiento-actual";

export type GrupoCaptura =
  | "recorrido"
  | "estacion"
  | "sacrificio";

export type FotoGuardada = {
  id: string;
  nombre: string;
  tipo: string;
  blob: Blob;
  grupoCaptura?: GrupoCaptura;
  estacionId?: string;
};

export type EstacionGuardada = {
  id: string;
  nombre: string;
  progresiva: number;
  observacion?: string;
};

export type LevantamientoGuardado = {
  id: string;
  labor: string;
  nivel: string;
  zona: string;
  escala: string;
  unidad: string;
  descripcionEscala: string;

  tipoLevantamiento?: "antes" | "despues";
  longitudMetros?: number;
  estaciones?: EstacionGuardada[];

  fotos: FotoGuardada[];
  actualizadoEn: string;
};

function abrirBaseDatos(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no está disponible en este dispositivo."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("No se pudo abrir la base de datos."));
  });
}

export async function guardarLevantamiento(
  levantamiento: LevantamientoGuardado,
): Promise<void> {
  const db = await abrirBaseDatos();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      store.put(
        {
          ...levantamiento,
          actualizadoEn: new Date().toISOString(),
        },
        DRAFT_KEY,
      );

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("No se pudo guardar."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("El guardado fue cancelado."));
    });
  } finally {
    db.close();
  }
}

export async function obtenerLevantamiento(): Promise<LevantamientoGuardado | null> {
  const db = await abrirBaseDatos();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(DRAFT_KEY);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("No se pudo recuperar el levantamiento."));
    });
  } finally {
    db.close();
  }
}

export async function eliminarLevantamiento(): Promise<void> {
  const db = await abrirBaseDatos();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).delete(DRAFT_KEY);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("No se pudo eliminar."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("La eliminación fue cancelada."));
    });
  } finally {
    db.close();
  }
}
