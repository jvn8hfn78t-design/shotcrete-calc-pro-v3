import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, Calculator, HardHat, ScanLine, ShieldCheck } from "lucide-react";
import { ShotcreteCalculator } from "@/components/ShotcreteCalculator";
import { Fotogrametria } from "@/components/Fotogrametria";
import { InstallButton } from "@/components/Pwa";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHOTCRETE CALC PRO — Cálculo de volumen de Shotcrete" },
      {
        name: "description",
        content:
          "Cálculo de volúmenes y cantidad de calibradores en campo para labores de shotcrete.",
      },
      { property: "og:title", content: "SHOTCRETE CALC PRO — Cálculo de volumen de Shotcrete" },
      {
        property: "og:description",
        content: "Cálculo de volúmenes y calibradores en campo. UM CHUNGAR.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [surveyOpened, setSurveyOpened] = useState(false);
  const [moduloActivo, setModuloActivo] = useState<"calculadora" | "fotogrametria">("calculadora");

  return (
    <div className="app-shell min-h-dvh bg-background text-foreground">
      <a href="#workspace" className="skip-link">
        Ir al área de trabajo
      </a>
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark">
            <HardHat aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="brand-name">
              SHOTCRETE <span>CALC PRO</span>
              <span className="version-tag">V3</span>
            </p>
            <p className="brand-caption">
              UM CHUNGAR <span> / </span> INGENIERÍA DE CAMPO
            </p>
          </div>
        </div>
        <div className="header-tools">
          <span className="local-badge">
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>Trabajo local · Sin conexión</span>
          </span>
          <InstallButton className="install-action" />
        </div>
      </header>

      <main id="workspace" className="workspace-main">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">
              <span className="status-dot" /> OPERACIONES SUBTERRÁNEAS
            </p>
            <h1>
              Cálculo y levantamiento<span className="text-primary">.</span>
            </h1>
            <p className="workspace-description">
              De las medidas de tu labor al volumen de aplicación.
            </p>
          </div>
          <div className="workspace-stamp" aria-hidden="true">
            <span>SHOTCRETE</span>
            <strong>CONTROL DE CAMPO</strong>
            <span>MEDIR / CALCULAR / REGISTRAR</span>
          </div>
        </div>

        <nav aria-label="Módulos principales" className="module-nav">
          <div className="module-tabs">
            <button
              type="button"
              aria-pressed={moduloActivo === "calculadora"}
              onClick={() => setModuloActivo("calculadora")}
              className={`module-tab ${moduloActivo === "calculadora" ? "is-active" : ""}`}
            >
              <Calculator aria-hidden="true" />
              <span>
                Calculadora<small>Volúmenes y calibradores</small>
              </span>
              <span className="tab-number">01</span>
            </button>
            <button
              type="button"
              aria-pressed={moduloActivo === "fotogrametria"}
              onClick={() => {
                setSurveyOpened(true);
                setModuloActivo("fotogrametria");
              }}
              className={`module-tab ${moduloActivo === "fotogrametria" ? "is-active" : ""}`}
            >
              <ScanLine aria-hidden="true" />
              <span>
                Fotogrametría<small>Fotos a puntos 3D</small>
              </span>
              <span className="tab-number">02</span>
            </button>
          </div>
          <span className="module-note">
            <ArrowUpRight className="size-4" aria-hidden="true" /> Diseñada para la labor
          </span>
        </nav>

        <section hidden={moduloActivo !== "calculadora"} aria-label="Calculadora de shotcrete">
          <ShotcreteCalculator />
        </section>
        {surveyOpened && (
          <section
            hidden={moduloActivo !== "fotogrametria"}
            aria-label="Reconstrucción fotogramétrica"
          >
            <Fotogrametria />
          </section>
        )}
      </main>

      <footer className="app-footer">
        <div>
          <p className="font-display text-base font-bold tracking-wide">
            SHOTCRETE CALC PRO <span className="text-primary">/</span> UM CHUNGAR
          </p>
          <p className="mt-1">
            Colaboración y autoría: Elmer Palomino Loayza · Brayan Alexander Toscano Chavez
          </p>
        </div>
        <span className="footer-credit">
          created by Batch <span>↗</span>
        </span>
      </footer>
    </div>
  );
}
