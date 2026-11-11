
import { useState } from "react";
import { Cpu, Gauge, Play, CheckCircle2, XCircle } from "lucide-react";

type EstadoPrueba = "pendiente" | "ejecutando" | "correcto" | "error";

type ResultadoPrueba = {
  estado: EstadoPrueba;
  detalle: string;
};

type BufferGPU = {
  mapAsync: (mode: number) => Promise<void>;
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
  destroy: () => void;
};

type DispositivoGPU = {
  createShaderModule: (descriptor: { code: string }) => unknown;
  createComputePipeline: (descriptor: {
    layout: "auto";
    compute: { module: unknown; entryPoint: string };
  }) => {
    getBindGroupLayout: (index: number) => unknown;
  };
  createBuffer: (descriptor: {
    size: number;
    usage: number;
  }) => BufferGPU;
  createBindGroup: (descriptor: {
    layout: unknown;
    entries: Array<{
      binding: number;
      resource: { buffer: BufferGPU };
    }>;
  }) => unknown;
  createCommandEncoder: () => {
    beginComputePass: () => {
      setPipeline: (pipeline: unknown) => void;
      setBindGroup: (index: number, group: unknown) => void;
      dispatchWorkgroups: (count: number) => void;
      end: () => void;
    };
    copyBufferToBuffer: (
      source: BufferGPU,
      sourceOffset: number,
      destination: BufferGPU,
      destinationOffset: number,
      size: number,
    ) => void;
    finish: () => unknown;
  };
  queue: {
    submit: (commands: unknown[]) => void;
  };
  destroy: () => void;
};

type AdaptadorGPU = {
  requestDevice: () => Promise<DispositivoGPU>;
};

export function PruebaRendimiento() {
  const [ejecutando, setEjecutando] = useState(false);

  const [wasm, setWasm] = useState<ResultadoPrueba>({
    estado: "pendiente",
    detalle: "Todavía no se ha ejecutado la prueba.",
  });

  const [gpu, setGpu] = useState<ResultadoPrueba>({
    estado: "pendiente",
    detalle: "Todavía no se ha ejecutado la prueba.",
  });

  const ejecutarWasm = async () => {
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0,
      1, 7, 1, 96, 2, 127, 127, 1, 127,
      3, 2, 1, 0,
      7, 9, 1, 5, 115, 117, 109, 97, 114, 0, 0,
      10, 9, 1, 7, 0, 32, 0, 32, 1, 106, 11,
    ]);

    const modulo = await WebAssembly.instantiate(bytes);
    const sumar = modulo.instance.exports.sumar as (
      a: number,
      b: number,
    ) => number;

    const cantidad = 500_000;
    let resultado = 0;

    const inicio = performance.now();

    for (let i = 0; i < cantidad; i++) {
      resultado = sumar(i, 1);
    }

    const duracion = performance.now() - inicio;

    if (resultado !== cantidad) {
      throw new Error("El resultado matemático no coincide.");
    }

    return {
      duracion,
      resultado,
      operaciones: cantidad,
    };
  };

  const ejecutarGpu = async () => {
    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<AdaptadorGPU | null>;
      };
    };

    if (!nav.gpu) {
      throw new Error("WebGPU no está disponible.");
    }

    const adaptador = await nav.gpu.requestAdapter();

    if (!adaptador) {
      throw new Error("No se encontró un adaptador gráfico.");
    }

    const dispositivo = await adaptador.requestDevice();

    const cantidad = 262_144;
    const bytes = cantidad * 4;

    let datos: BufferGPU | null = null;
    let lectura: BufferGPU | null = null;

    try {
      const shader = dispositivo.createShaderModule({
        code: `
          @group(0) @binding(0)
          var<storage, read_write> salida: array<u32>;

          @compute @workgroup_size(256)
          fn main(
            @builtin(global_invocation_id) id: vec3<u32>
          ) {
            let i = id.x;

            if (i < 262144u) {
              salida[i] =
                (i * 1664525u + 1013904223u) ^ (i >> 3u);
            }
          }
        `,
      });

      const pipeline = dispositivo.createComputePipeline({
        layout: "auto",
        compute: {
          module: shader,
          entryPoint: "main",
        },
      });

      datos = dispositivo.createBuffer({
  size: bytes,
  usage: 128 | 4,
});

lectura = dispositivo.createBuffer({
  size: bytes,
  usage: 1 | 8,
});

      const grupo = dispositivo.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: { buffer: datos },
          },
        ],
      });

      const tiempos: number[] = [];
      let resultadoCorrecto = false;

      for (let repeticion = 0; repeticion < 3; repeticion++) {
        const encoder = dispositivo.createCommandEncoder();
        const pase = encoder.beginComputePass();

        pase.setPipeline(pipeline);
        pase.setBindGroup(0, grupo);
        pase.dispatchWorkgroups(1024);
        pase.end();

        encoder.copyBufferToBuffer(
          datos,
          0,
          lectura,
          0,
          bytes,
        );

        const inicio = performance.now();

        dispositivo.queue.submit([encoder.finish()]);

        await lectura.mapAsync(1);

        const valores = new Uint32Array(
          lectura.getMappedRange(),
        );

       resultadoCorrecto =
  valores.length === cantidad &&
  valores[0] === 1013904223 &&
  valores[cantidad - 1] ===
    (
      (((cantidad - 1) * 1664525 + 1013904223) >>> 0) ^
      ((cantidad - 1) >>> 3)
    );
        lectura.unmap();

        tiempos.push(performance.now() - inicio);

        if (!resultadoCorrecto) {
          throw new Error("La verificación de datos GPU falló.");
        }
      }

      const promedio =
        tiempos.reduce((total, tiempo) => total + tiempo, 0) /
        tiempos.length;

      return {
        duracion: promedio,
        cantidad,
      };
    } finally {
      datos?.destroy();
      lectura?.destroy();
      dispositivo.destroy();
    }
  };

  const ejecutarPruebas = async () => {
    setEjecutando(true);

    setWasm({
      estado: "ejecutando",
      detalle: "Ejecutando operaciones WebAssembly...",
    });

    setGpu({
      estado: "ejecutando",
      detalle: "Preparando procesamiento gráfico...",
    });

    try {
      const resultado = await ejecutarWasm();

      setWasm({
        estado: "correcto",
        detalle: `${resultado.operaciones.toLocaleString("es-PE")} operaciones verificadas en ${resultado.duracion.toFixed(2)} ms. Resultado: ${resultado.resultado}.`,
      });
    } catch (error) {
      setWasm({
        estado: "error",
        detalle:
          error instanceof Error
            ? error.message
            : "Error durante la prueba WebAssembly.",
      });
    }

    try {
      const resultado = await ejecutarGpu();

      setGpu({
        estado: "correcto",
        detalle: `${resultado.cantidad.toLocaleString("es-PE")} datos procesados y verificados. Tiempo promedio de envío y lectura: ${resultado.duracion.toFixed(2)} ms.`,
      });
    } catch (error) {
      setGpu({
        estado: "error",
        detalle:
          error instanceof Error
            ? error.message
            : "Error durante la prueba WebGPU.",
      });
    }

    setEjecutando(false);
  };

  const iconoEstado = (estado: EstadoPrueba) => {
    if (estado === "correcto") {
      return <CheckCircle2 className="size-5 text-green-600" />;
    }

    if (estado === "error") {
      return <XCircle className="size-5 text-destructive" />;
    }

    if (estado === "ejecutando") {
      return <Gauge className="size-5 animate-pulse text-primary" />;
    }

    return <Cpu className="size-5 text-muted-foreground" />;
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div>
        <h3 className="font-bold uppercase">
          Prueba de rendimiento
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Evaluación inicial del procesamiento local del dispositivo.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            {iconoEstado(wasm.estado)}
            <p className="font-bold">WebAssembly</p>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            {wasm.detalle}
          </p>
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            {iconoEstado(gpu.estado)}
            <p className="font-bold">WebGPU</p>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            {gpu.detalle}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void ejecutarPruebas()}
        disabled={ejecutando}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50"
      >
        <Play className="size-4" />
        {ejecutando ? "EJECUTANDO PRUEBAS..." : "INICIAR PRUEBAS"}
      </button>

      <p className="text-xs text-muted-foreground">
        La prueba mide operaciones matemáticas y procesamiento gráfico
        básico. No representa todavía el rendimiento de una reconstrucción
        fotogramétrica completa.
      </p>
    </section>
  );
}
