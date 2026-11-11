
import { useEffect, useState } from "react";
import { Info, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type Resultado = {
  nombre: string;
  disponible: boolean;
  detalle: string;
};

export function DiagnosticoDispositivo() {
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [comprobando, setComprobando] = useState(true);

  const comprobar = async () => {
    setComprobando(true);

    const canvas = document.createElement("canvas");
    const webgl2 = !!canvas.getContext("webgl2");
    const webgl = webgl2 || !!canvas.getContext("webgl");

    const wasm =
      typeof WebAssembly !== "undefined" &&
      WebAssembly.validate(
        Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]),
      );

    const camara =
      !!navigator.mediaDevices?.getUserMedia;

    const indexedDBDisponible =
      typeof indexedDB !== "undefined";

    const serviceWorkerDisponible =
      "serviceWorker" in navigator;

    const serviceWorkerActivo =
      serviceWorkerDisponible &&
      !!navigator.serviceWorker.controller;

    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<unknown>;
      };
    };

    let webgpuDisponible = false;

    if (nav.gpu) {
      try {
        const adaptador = await nav.gpu.requestAdapter();
        webgpuDisponible = !!adaptador;
      } catch {
        webgpuDisponible = false;
      }
    }

    const nuevosResultados: Resultado[] = [
      {
        nombre: "WebAssembly",
        disponible: wasm,
        detalle: wasm
          ? "Puede ejecutar módulos WebAssembly."
          : "No se pudo validar WebAssembly.",
      },
      {
        nombre: "Web Workers",
        disponible: typeof Worker !== "undefined",
        detalle:
          typeof Worker !== "undefined"
            ? "Permite ejecutar tareas en segundo plano."
            : "No disponible en este navegador.",
      },
      {
        nombre: "WebGL",
        disponible: webgl,
        detalle: webgl2
          ? "WebGL 2 disponible."
          : webgl
            ? "WebGL disponible, sin WebGL 2."
            : "No se pudo crear un contexto WebGL.",
      },
      {
        nombre: "WebGPU",
        disponible: webgpuDisponible,
        detalle: webgpuDisponible
          ? "API y adaptador gráfico disponibles."
          : "No se encontró un adaptador WebGPU disponible.",
      },
      {
        nombre: "IndexedDB",
        disponible: indexedDBDisponible,
        detalle: indexedDBDisponible
          ? "Almacenamiento local disponible."
          : "IndexedDB no está disponible.",
      },
      {
        nombre: "Acceso a cámara",
        disponible: camara,
        detalle: camara
          ? "El navegador ofrece acceso a cámara mediante API."
          : "No ofrece acceso a cámara mediante getUserMedia.",
      },
      {
        nombre: "Service Worker",
        disponible: serviceWorkerDisponible,
        detalle: serviceWorkerActivo
          ? "La aplicación está controlada por un Service Worker."
          : serviceWorkerDisponible
            ? "Soportado, pero todavía no controla esta página."
            : "No disponible en este navegador.",
      },
      {
        nombre: "Conexión a internet",
        disponible: navigator.onLine,
        detalle: navigator.onLine
          ? "El navegador informa que está conectado."
          : "El navegador informa que está sin conexión.",
      },
      {
        nombre: "Contexto seguro HTTPS",
        disponible: window.isSecureContext,
        detalle: window.isSecureContext
          ? "La página se ejecuta en un contexto seguro."
          : "La página no está en un contexto seguro.",
      },
    ];

    setResultados(nuevosResultados);
    setComprobando(false);
  };

  useEffect(() => {
    void comprobar();
  }, []);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold uppercase">
            Diagnóstico del dispositivo
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Capacidades del navegador para procesamiento fotogramétrico.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void comprobar()}
          disabled={comprobando}
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${comprobando ? "animate-spin" : ""}`} />
          Repetir
        </button>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex gap-2">
          <Info className="size-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            Esta prueba identifica capacidades del navegador.
            No ejecuta todavía una reconstrucción 3D ni mide
            el rendimiento real del dispositivo.
          </p>
        </div>
      </div>

      {comprobando ? (
        <p className="text-sm text-muted-foreground">
          Comprobando capacidades...
        </p>
      ) : (
        <div className="space-y-2">
          {resultados?.map((resultado) => (
            <div
              key={resultado.nombre}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              {resultado.disponible ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
              ) : (
                <XCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              )}

              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {resultado.nombre}
                </p>
                <p className="text-xs text-muted-foreground">
                  {resultado.detalle}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
