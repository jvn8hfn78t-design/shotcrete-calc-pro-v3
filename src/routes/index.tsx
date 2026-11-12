import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Calculator, HardHat, ScanLine, ShieldCheck } from "lucide-react";
import { ShotcreteCalculator } from "@/components/ShotcreteCalculator";
import { Fotogrametria } from "@/components/Fotogrametria";
import { InstallButton } from "@/components/Pwa";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHOTCRETE CALC PRO — Cálculo de volumen de Shotcrete" },
      { name: "description", content: "Cálculo de volúmenes y cantidad de calibradores en campo para labores de shotcrete." },
      { property: "og:title", content: "SHOTCRETE CALC PRO — Cálculo de volumen de Shotcrete" },
      { property: "og:description", content: "Cálculo de volúmenes y calibradores en campo. UM CHUNGAR." },
    ],
  }),
  component: Index,
});

function Index() {
  const [moduloActivo, setModuloActivo] = useState<"calculadora" | "fotogrametria">("calculadora");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
              <HardHat className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate font-display text-lg font-bold uppercase tracking-[0.035em] sm:text-xl">SHOTCRETE <span className="text-primary">CALC PRO</span></p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">UM CHUNGAR · HERRAMIENTA DE CAMPO</p>
            </div>
          </div>
          <InstallButton className="hidden shrink-0 items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold uppercase tracking-wide text-foreground transition-colors hover:border-primary sm:inline-flex" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-9">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">OPERACIONES · SHOTCRETE</p>
            <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-tight sm:text-4xl">Cálculo y levantamiento</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Herramientas técnicas para medición, cubicación y registro de labores.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" /> Preparada para uso sin conexión
          </span>
        </div>

        <nav aria-label="Módulos principales" className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-1.5 sm:mb-8">
          <button type="button" aria-pressed={moduloActivo === "calculadora"}
            onClick={() => setModuloActivo("calculadora")}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-lg px-2 py-3 text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm ${moduloActivo === "calculadora" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <Calculator className="size-4 shrink-0 sm:size-5" aria-hidden="true" /> Calculadora
          </button>
          <button type="button" aria-pressed={moduloActivo === "fotogrametria"}
            onClick={() => setModuloActivo("fotogrametria")}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-lg px-2 py-3 text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm ${moduloActivo === "fotogrametria" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <ScanLine className="size-4 shrink-0 sm:size-5" aria-hidden="true" /> Fotogrametría
          </button>
        </nav>

        <section aria-label={moduloActivo === "calculadora" ? "Calculadora de shotcrete" : "Captura fotogramétrica"}>
          {moduloActivo === "calculadora" ? <ShotcreteCalculator /> : <Fotogrametria />}
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6 text-center">
        <p className="text-xs font-semibold text-muted-foreground">SHOTCRETE CALC PRO · UM CHUNGAR</p>
        <p className="mt-1 text-xs text-muted-foreground">Colaboración y autoría: Elmer Palomino Loayza · Brayan Alexander Toscano Chavez</p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">created by Batch</p>
      </footer>
    </div>
  );
}
