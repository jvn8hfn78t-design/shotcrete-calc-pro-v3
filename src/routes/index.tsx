import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Calculator, HardHat, ScanLine } from "lucide-react";
import { ShotcreteCalculator } from "@/components/ShotcreteCalculator";
import { Fotogrametria } from "@/components/Fotogrametria";
import { InstallButton } from "@/components/Pwa";
import heroTunnel from "@/assets/hero-tunnel.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHOTCRETE CALC PRO — Cálculo de volumen de Shotcrete" },
      {
        name: "description",
        content:
          "Cálculo de volúmenes y cantidad de calibradores en campo para labores de shotcrete.",
      },
      {
        property: "og:title",
        content: "SHOTCRETE CALC PRO — Cálculo de volumen de Shotcrete",
      },
      {
        property: "og:description",
        content:
          "Cálculo de volúmenes y calibradores en campo. UM CHUNGAR.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [moduloActivo, setModuloActivo] = useState<"calculadora" | "fotogrametria">("calculadora");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* CARÁTULA */}
      <section className="relative flex min-h-screen flex-col overflow-hidden">
        {/* Imagen de fondo */}
        <img
          src={heroTunnel}
          alt=""
          width={1920}
          height={1088}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />

        {/* Capas de fondo */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/55 via-background/80 to-background" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_100%)]" />

        {/* Contenido */}
        <div className="relative z-10 flex min-h-screen flex-col">
          {/* Encabezado */}
          <header className="flex items-center justify-between px-5 py-5 sm:px-8">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary">
                <HardHat className="size-5 text-primary-foreground" />
              </span>

              <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
                UM CHUNGAR
              </span>
            </div>

            <InstallButton className="hidden items-center gap-2 rounded-lg border border-border bg-background/60 px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:inline-flex" />
          </header>

          {/* Centro de la carátula */}
          <main className="flex flex-1 items-center justify-center px-5 py-10">
            <div className="w-full max-w-3xl text-center">
              {/* Nombre principal */}
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.35em] text-primary sm:text-sm">
                UM CHUNGAR
              </p>

              <h1 className="font-display text-5xl font-black uppercase leading-none tracking-tight sm:text-7xl md:text-8xl">
                SHOTCRETE
                <span className="block text-primary">CALC PRO</span>
              </h1>

              {/* Subtítulo */}
              <p className="mt-6 font-display text-xl font-semibold uppercase tracking-wide text-white sm:text-2xl md:text-3xl">
                Cálculo de volumen de Shotcrete
              </p>

              {/* Autoría */}
              <div className="mx-auto mt-10 max-w-md border-y border-border/70 py-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                  Colaboración y Autoría
                </p>

                <div className="mt-3 space-y-1">
                  <p className="text-sm font-medium text-foreground sm:text-base">
                    Elmer Palomino Loayza
                  </p>

                  <p className="text-sm font-medium text-foreground sm:text-base">
                    Brayan Alexander Toscano Chavez
                  </p>
                </div>
              </div>

              {/* Descripción */}
              <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Cálculo de volúmenes y cantidad de calibradores en campo.
              </p>

              {/* Botón ingresar */}
              <div className="mt-9 flex justify-center">
                <a
                  href="#calculadora"
                  className="inline-flex h-14 items-center gap-3 rounded-lg bg-primary px-10 font-display text-xl font-bold uppercase tracking-wider text-primary-foreground shadow-[0_0_32px_-10px] shadow-primary/70 transition-all hover:brightness-110 active:scale-[0.98] sm:h-16 sm:px-12 sm:text-2xl"
                >
                  <Calculator className="size-6 sm:size-7" />
                  INGRESAR
                </a>
              </div>
            </div>
          </main>

          {/* Pie de carátula */}
          <footer className="px-5 pb-7 pt-4 text-center sm:px-8">
            <div className="mx-auto mb-5 h-px max-w-md bg-border/70" />

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-sm">
              Cálculo de volúmenes y calibradores
            </p>

            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
              • 100% OFFLINE •
            </p>

            <p className="mt-4 text-[10px] font-medium lowercase tracking-[0.18em] text-muted-foreground">
              created by
            </p>

            <p className="mt-0.5 font-display text-sm font-bold uppercase tracking-[0.22em] text-foreground">
              Batch
            </p>
          </footer>
        </div>
      </section>

           {/* MÓDULOS PRINCIPALES */}
      <section
        id="calculadora"
        className="mx-auto max-w-6xl scroll-mt-4 px-4 py-8 sm:py-14"
      >
        {/* Selector de módulos */}
        <div className="mb-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setModuloActivo("calculadora")}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-xs font-bold uppercase transition-colors sm:text-sm ${
              moduloActivo === "calculadora"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary"
            }`}
          >
            <Calculator className="size-5" />
            Calculadora
          </button>

          <button
            type="button"
            onClick={() => setModuloActivo("fotogrametria")}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-xs font-bold uppercase transition-colors sm:text-sm ${
              moduloActivo === "fotogrametria"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary"
            }`}
          >
            <ScanLine className="size-5" />
            Fotogrametría
          </button>
        </div>

        {/* Contenido del módulo seleccionado */}
        {moduloActivo === "calculadora" ? (
          <ShotcreteCalculator />
        ) : (
          <Fotogrametria />
        )}
      </section>
    </div>
  );
}
