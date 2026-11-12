import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import { PilotoLabor3D } from "./PilotoLabor3D";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  ClipboardCopy,
  RotateCcw,
  Check,
  AlertTriangle,
  Camera,
  ImagePlus,
  X,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

const FARC_DEFAULT = 0.90;

// ---- Rendimientos de shotcrete (m² por m³) ----
// Cambiar estos valores aquí si los rendimientos varían.
const DEFAULT_RENDIMIENTOS_SHOTCRETE: Record<string, number> = {
  "1": 17,
  "1.5": 14,
  "2": 11.5,
  "3": 7.6,
  "4": 5.7,
};

const RENDIMIENTOS_STORAGE_KEY =
  "shotcrete-calc-pro-v2-rendimientos";

// Rangos razonables para labores subterráneas
const RANGES = {
  h: { min: 0.5, max: 15, label: "Altura (H)" },
  a: { min: 0.5, max: 20, label: "Ancho (A)" },
  l: { min: 0.1, max: 50, label: "Avance (L)" },
} as const;

type Mode = "avance" | "resane" | "malla";
type FieldKey = keyof typeof RANGES;

type CalculationResult = {
  P: number;
  area: number;

  // Avance
  vBase?: number;
  sh1?: number;
  sh2?: number;
  vReal1?: number;
  vReal2?: number;

  // Malla
  vMalla?: number;

  // Resane
  vResane?: number;
  filas?: number;

  // Calibradores
  calib?: number;
};

function parse(v: string): number {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function average(values: string[]): number {
  const numbers = values
    .map(parse)
    .filter((value) => value > 0);

  if (numbers.length === 0) return 0;

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}
function calculateResults(
  mode: Mode,
  H: number,
  A: number,
  L: number,
  espesorNumero: number,
  rendimientos: Record<string, number>
): CalculationResult {
  if (mode === "avance") {
  const P = (2 * H + A) * FARC_DEFAULT;
  const area = P * L;

  const rendimiento =
  rendimientos[String(espesorNumero)] ??
  rendimientos["2"];

  const vBase = area / rendimiento;

    const sh1 =
    (Math.max(H - 1.5, 0) * A * FARC_DEFAULT) /
    rendimientos["1"];

  const sh2 =
  (Math.max(H - 1.5, 0) * A * FARC_DEFAULT) /
  rendimientos["2"];
  const vReal1 = vBase + sh1;
  const vReal2 = vBase + sh2;

  const calib =
  H <= 0
    ? 0
    : H > 4.2
      ? Math.round((H - 1) * 2 * 2)
      : Math.ceil(P - 1) * 2;

  return {
    P,
    area,
    vBase,
    sh1,
    sh2,
    vReal1,
    vReal2,
    calib,
  };
}

  if (mode === "malla") {
  const P = (2 * H + A) * FARC_DEFAULT;
  const area = P * L;

  const rendimiento =
  rendimientos[String(espesorNumero)] ??
  rendimientos["2"];

  const vMalla = area / rendimiento;

  return {
    P,
    area,
    vMalla,
  };
}

  const area = H * L;
const vResane = area / rendimientos["2"];

const filas = H < 1.9 ? 1 : Math.floor(H);

const calib =
  H <= 0 || L <= 0
    ? 0
    : filas * Math.ceil(Math.max(L - 1, 0));

const P = 2 * H;

return {
  P,
  area,
  vResane,
  calib,
};
}
const fmt = (n: number, d = 1) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt2 = (n: number) => fmt(n, 1);

function fieldError(key: FieldKey, raw: string): string | null {
  if (raw.trim() === "") return null; // vacío: sin error inline, simplemente no hay cálculo
  const v = parse(raw);
  const { min, max, label } = RANGES[key];
  if (!(v > 0)) return `${label} debe ser mayor que 0`;
  if (v < min || v > max) return `${label}: rango permitido ${min} – ${max} m`;
  return null;
}

interface FieldProps {
  fieldKey: FieldKey;
  value: string;
  onChange: (v: string) => void;
}

function Field({ fieldKey, value, onChange }: FieldProps) {
  const error = fieldError(fieldKey, value);

  return (
    <label className="block">
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={value}
        placeholder="0.00"
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={`h-12 w-full min-w-0 rounded-lg border bg-background px-2 text-base font-bold tabular-nums sm:px-3 sm:text-xl text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20 ${
          error ? "border-destructive" : "border-input focus:border-primary"
        }`}
      />

      {error && (
        <span className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" /> {error}
        </span>
      )}
    </label>
  );
}

function ResultCard({
  label,
  value,
  unit,
  highlight = false,
  mediumHighlight = false,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
  mediumHighlight?: boolean;
}) {
  return (
    <div
  className={`min-w-0 rounded-xl border p-3.5 sm:p-5 ${
    highlight
      ? "border-primary/50 bg-primary/10"
      : mediumHighlight
        ? "border-primary/25 bg-primary/5"
        : "border-border bg-card"
  }`}
>
  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
    {label}
  </p>

  <p className="mt-2 flex flex-wrap items-baseline gap-x-1 font-display text-3xl font-bold tabular-nums leading-none sm:text-4xl">
    <span
      className={
        highlight
          ? "text-primary"
          : mediumHighlight
            ? "text-primary/80"
            : "text-foreground"
      }
    >
      {value}
    </span>{" "}
    <span className="text-lg font-semibold text-muted-foreground">
      {unit}
    </span>
  </p>
</div>
  );
}

export function ShotcreteCalculator() {
  const [mode, setMode] = useState<Mode>("avance");
  const [h, setH] = useState<string[]>([""]);
const [a, setA] = useState<string[]>([""]);
const [l, setL] = useState<string[]>([""]);
const [labor, setLabor] = useState("");
const [nivel, setNivel] = useState("");
const [operador, setOperador] = useState("");
const [espesor, setEspesor] = useState("2");
const [observaciones, setObservaciones] = useState("");
const [copied, setCopied] = useState(false);
const [calculated, setCalculated] = useState(false);
const [result, setResult] = useState<CalculationResult | null>(null);
const [photos, setPhotos] = useState<string[]>([]);
const [rendimientos, setRendimientos] = useState<Record<string, number>>(
  DEFAULT_RENDIMIENTOS_SHOTCRETE
);

const [rendimientosDraft, setRendimientosDraft] = useState<
  Record<string, string>
>(
  Object.fromEntries(
    Object.entries(DEFAULT_RENDIMIENTOS_SHOTCRETE).map(([key, value]) => [
      key,
      String(value),
    ])
  )
);

const [showRendimientos, setShowRendimientos] = useState(false);
const [showMenu, setShowMenu] = useState(false);
const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RENDIMIENTOS_STORAGE_KEY);

      if (!saved) return;

      const parsed = JSON.parse(saved) as Record<string, unknown>;

      const loaded = { ...DEFAULT_RENDIMIENTOS_SHOTCRETE };

      Object.keys(DEFAULT_RENDIMIENTOS_SHOTCRETE).forEach((key) => {
        const value = Number(parsed[key]);

        if (Number.isFinite(value) && value > 0) {
          loaded[key] = value;
        }
      });

      setRendimientos(loaded);

      setRendimientosDraft(
        Object.fromEntries(
          Object.entries(loaded).map(([key, value]) => [
            key,
            String(value),
          ])
        )
      );
    } catch {
      // Si hay un dato inválido, se mantienen los valores por defecto.
    }
  }, []);
      const errors = useMemo(() => {
  const list: string[] = [];

  h.forEach((value, index) => {
    if (value.trim() === "") return;

    const error = fieldError("h", value);
    if (error) {
      list.push(`Altura ${index + 1}: ${error}`);
    }
  });

  l.forEach((value, index) => {
    if (value.trim() === "") return;

    const error = fieldError("l", value);
    if (error) {
      list.push(`Avance ${index + 1}: ${error}`);
    }
  });

  if (mode === "avance" || mode === "malla") {
    a.forEach((value, index) => {
      if (value.trim() === "") return;

      const error = fieldError("a", value);
      if (error) {
        list.push(`Ancho ${index + 1}: ${error}`);
      }
    });
  }

  return list;
}, [mode, h, a, l]);

  const inputsComplete =
  mode === "avance" || mode === "malla"
    ? h.some((value) => value.trim() !== "") &&
      a.some((value) => value.trim() !== "") &&
      l.some((value) => value.trim() !== "")
    : h.some((value) => value.trim() !== "") &&
      l.some((value) => value.trim() !== "");

  const espesorNumero = parse(espesor);

const espesorValido =
  mode === "resane"
    ? true
    : Number.isFinite(espesorNumero) &&
      Number(rendimientos[String(espesorNumero)]) > 0;

const valid = inputsComplete && errors.length === 0 && espesorValido;


  const shown = calculated && valid ? result : null;
  const ancho3D = average(a);
  const alto3D = average(h);
  const largo3D = average(l);
  const modeloDisponible = mode !== "resane" && ancho3D > 0 && alto3D > 0 && largo3D > 0 && errors.length === 0;


const photosLimitReached = photos.length >= 10;
const addPhotos = (files: FileList | null) => {
  if (!files) return;

  const selectedFiles = Array.from(files);

  if (photos.length >= 10) {
    toast.error("Máximo de 10 fotografías por reporte");
    return;
  }

  const availableSlots = 10 - photos.length;
  const filesToAdd = selectedFiles.slice(0, availableSlots);

  if (selectedFiles.length > availableSlots) {
    toast.error(`Solo puedes agregar ${availableSlots} fotografía${availableSlots === 1 ? "" : "s"} más`);
  }

filesToAdd.forEach((file) => {
  if (!file.type.startsWith("image/")) {
    toast.error("Solo se permiten archivos de imagen");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    toast.error(`La foto "${file.name}" supera el límite de 10 MB`);
    return;
  }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") return;

      const img = new Image();

      img.onload = () => {
        const maxWidth = 1600;
        const scale = Math.min(1, maxWidth / img.width);

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        ctx.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        );

        const compressedPhoto = canvas.toDataURL(
          "image/jpeg",
          0.75
        );

        setPhotos((current) => [
          ...current,
          compressedPhoto,
        ]);
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
};

const removePhoto = (index: number) => {
  setPhotos((current) => current.filter((_, i) => i !== index));
};

  const calculate = () => {
  if (!valid) {
    toast.error("Ingresa valores válidos para calcular");
    return;
  }

  const H = average(h);
  const A = average(a);
  const L = average(l);

  const calculatedResult = calculateResults(
  mode,
  H,
  A,
  L,
  espesorNumero,
  rendimientos
);

  setResult(calculatedResult);
  setCalculated(true);

  toast.success("Cálculo realizado correctamente");

  setTimeout(() => {
    resultsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 100);
};

const addMeasurement = (
  setter: React.Dispatch<React.SetStateAction<string[]>>
) => {
  setter((values) => [...values, ""]);
  invalidateCalculation();
};

const removeMeasurement = (
  setter: React.Dispatch<React.SetStateAction<string[]>>,
  index: number
) => {
  setter((values) => {
    if (values.length === 1) return values;
    return values.filter((_, i) => i !== index);
  });
  invalidateCalculation();
};

const invalidateCalculation = () => {
  setCalculated(false);
  setResult(null);
};

const saveRendimientos = () => {
  const next: Record<string, number> = {};

  for (const key of Object.keys(DEFAULT_RENDIMIENTOS_SHOTCRETE)) {
    const value = parse(rendimientosDraft[key] ?? "");

    if (!(value > 0)) {
      toast.error(
        `El rendimiento de ${key} pulgadas debe ser mayor que 0`
      );
      return;
    }

    next[key] = value;
  }

  setRendimientos(next);

  try {
    localStorage.setItem(
      RENDIMIENTOS_STORAGE_KEY,
      JSON.stringify(next)
    );
  } catch {
    toast.error("No se pudieron guardar los rendimientos");
    return;
  }

  invalidateCalculation();
  toast.success("Rendimientos guardados");
};

const resetRendimientos = () => {
  setRendimientos(DEFAULT_RENDIMIENTOS_SHOTCRETE);

  setRendimientosDraft(
    Object.fromEntries(
      Object.entries(DEFAULT_RENDIMIENTOS_SHOTCRETE).map(
        ([key, value]) => [key, String(value)]
      )
    )
  );

  try {
    localStorage.removeItem(RENDIMIENTOS_STORAGE_KEY);
  } catch {
    // Se mantienen los valores por defecto.
  }

  invalidateCalculation();
  toast.success("Rendimientos restablecidos");
};

const reset = () => {
  setH([""]);
  setA([""]);
  setL([""]);
  setLabor("");
  setNivel("");
  setOperador("");
  setEspesor("2");
  setObservaciones("");
  setCalculated(false);
  setResult(null);
  setPhotos([]);
  toast.success("Campos limpiados");
};

const buildPDF = () => {
  if (!shown) {
    toast.error("Primero realiza el cálculo");
    return null;
  }

  const pdf = new jsPDF("p", "mm", "a4");

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const date = new Date().toLocaleDateString("es-PE");

  const safeLabor =
    labor.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "Sin_Labor";

  const fileName = `Reporte_Shotcrete_${safeLabor}_${date.replace(
    /\//g,
    "-"
  )}.pdf`;

  const fmtPDF = (value: number, decimals = 1) =>
    Number(value || 0).toFixed(decimals);

  // ─────────────────────────────────────────────
  // ENCABEZADO
  // ─────────────────────────────────────────────

  pdf.setFillColor(35, 35, 35);
  pdf.rect(0, 0, pageWidth, 30, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("UM CHUNGAR", margin, 12);

  pdf.setFontSize(11);
  pdf.text("CÁLCULO DE VOLUMEN DE SHOTCRETE", margin, 21);

  // ─────────────────────────────────────────────
// DATOS GENERALES
// ─────────────────────────────────────────────

let y = 40;

const generalBoxHeight = 27;

pdf.setDrawColor(150, 150, 150);
pdf.setLineWidth(0.4);
pdf.rect(margin, y, contentWidth, generalBoxHeight);

pdf.setTextColor(35, 35, 35);
pdf.setFont("helvetica", "bold");
pdf.setFontSize(10);

pdf.text(
  "DATOS GENERALES",
  margin + 4,
  y + 6
);

const leftX = margin + 4;
const rightX = margin + contentWidth / 2 + 3;

pdf.setFontSize(8.5);

pdf.setFont("helvetica", "bold");
pdf.text("Fecha:", leftX, y + 14);
pdf.text("Operador:", rightX, y + 14);

pdf.setFont("helvetica", "normal");
pdf.text(date, leftX + 27, y + 14);
pdf.text(operador || "—", rightX + 27, y + 14);

pdf.setFont("helvetica", "bold");
pdf.text("Nivel:", leftX, y + 22);
pdf.text("Labor:", rightX, y + 22);

pdf.setFont("helvetica", "normal");
pdf.text(nivel || "—", leftX + 27, y + 22);
pdf.text(labor || "—", rightX + 27, y + 22);

y += generalBoxHeight;

      // ─────────────────────────────────────────────
    // DATOS DE LA LABOR
    // ─────────────────────────────────────────────
    
    y += 5;

const laborRows =
  mode === "avance"
    ? 5
    : mode === "malla"
      ? 4
      : 3;

const laborBoxHeight = 10 + laborRows * 6;
    
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.4);
    pdf.rect(
      margin,
      y,
      contentWidth,
      laborBoxHeight
    );
    
    pdf.setTextColor(35, 35, 35);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    
    pdf.text(
      "DATOS DE LA LABOR",
      margin + 4,
      y + 6
    );
    
    y += 12;
    
    const drawDataRow = (
      label: string,
      value: string,
      rowY: number
    ) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text(label, margin + 4, rowY);
    
      pdf.setFont("helvetica", "normal");
      pdf.text(value, margin + 55, rowY);
    };
    
    const modoTexto =
      mode === "avance"
        ? "AVANCE"
        : mode === "malla"
          ? "MALLA"
          : "RESANE";
    
    drawDataRow("USO", modoTexto, y);
    y += 6;
    
    drawDataRow(
      "ALTURA",
      `${fmtPDF(average(h))} m`,
      y
    );
    y += 6;
    
    if (mode !== "resane") {
      drawDataRow(
        "ANCHO",
        `${fmtPDF(average(a))} m`,
        y
      );
      y += 6;
    }
    
    drawDataRow(
      "AVANCE",
      `${fmtPDF(average(l))} m`,
      y
    );
    y += 6;
    
    if (mode === "avance") {
      drawDataRow(
        "ESPESOR",
        `${espesor}"`,
        y
      );
      y += 6;
    }
    
    y += 2;

// Línea separadora
y += 1;

  pdf.setDrawColor(190, 190, 190);
  pdf.line(margin, y, pageWidth - margin, y);

  // ─────────────────────────────────────────────
  // RESULTADOS
  // ─────────────────────────────────────────────

  y += 6;

  pdf.setFillColor(235, 235, 235);
  pdf.rect(margin, y, contentWidth, 8, "F");

  pdf.setTextColor(35, 35, 35);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("RESULTADOS", margin + 4, y + 5.5);

  y += 14;

  // AVANCE
if (mode === "avance") {
  const colWidth = contentWidth / 2;

  // ─────────────────────────────────────────────
  // PERÍMETRO / ÁREA
  // ─────────────────────────────────────────────

  const mainBoxHeight = 20;

  pdf.setDrawColor(150, 150, 150);
  pdf.setLineWidth(0.4);

  pdf.rect(
    margin,
    y,
    contentWidth,
    mainBoxHeight
  );

  pdf.line(
    margin + colWidth,
    y,
    margin + colWidth,
    y + mainBoxHeight
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(60, 60, 60);

  pdf.text(
    "PERÍMETRO",
    margin + 3,
    y + 5
  );

  pdf.text(
    "ÁREA",
    margin + colWidth + 3,
    y + 5
  );

  pdf.setFontSize(10);
  pdf.setTextColor(25, 25, 25);

  pdf.text(
    `${fmtPDF(shown.P)} m`,
    margin + 3,
    y + 15
  );

  pdf.text(
    `${fmtPDF(shown.area)} m²`,
    margin + colWidth + 3,
    y + 15
  );


  y += mainBoxHeight + 5;

  // ─────────────────────────────────────────────
// CÁLCULO DE SHOTCRETE
// ─────────────────────────────────────────────

const shotcreteBoxHeight = 36;

pdf.setDrawColor(150, 150, 150);
pdf.setLineWidth(0.4);

pdf.rect(
  margin,
  y,
  contentWidth,
  shotcreteBoxHeight
);

pdf.setTextColor(35, 35, 35);
pdf.setFont("helvetica", "bold");
pdf.setFontSize(10);

pdf.text(
  "CÁLCULO DE SHOTCRETE",
  margin + 4,
  y + 6
);

// Línea horizontal debajo del título
pdf.line(
  margin,
  y + 9,
  margin + contentWidth,
  y + 9
);

// Línea vertical central
const shotcreteMidX = margin + contentWidth / 2;

pdf.line(
  shotcreteMidX,
  y + 9,
  shotcreteMidX,
  y + shotcreteBoxHeight
);

// Encabezados
pdf.setFont("helvetica", "bold");
pdf.setFontSize(8);
pdf.setTextColor(60, 60, 60);

pdf.text(
  'SH SACRIFICIO 1"',
  margin + 4,
  y + 14
);

pdf.text(
  'M³ LABOR 1"',
  shotcreteMidX + 4,
  y + 14
);

// Valores fila 1
pdf.setFontSize(10);
pdf.setTextColor(25, 25, 25);

pdf.text(
  `${fmtPDF(shown.sh1 ?? 0)} m³`,
  margin + 4,
  y + 20
);

pdf.text(
  `${fmtPDF(shown.vReal1 ?? 0)} m³`,
  shotcreteMidX + 4,
  y + 20
);

// Separador entre filas
pdf.line(
  margin,
  y + 23,
  margin + contentWidth,
  y + 23
);

// Encabezados fila 2
pdf.setFont("helvetica", "bold");
pdf.setFontSize(8);
pdf.setTextColor(60, 60, 60);

pdf.text(
  'SH SACRIFICIO 2"',
  margin + 4,
  y + 28
);

pdf.text(
  'M³ LABOR 2"',
  shotcreteMidX + 4,
  y + 28
);

// Valores fila 2
pdf.setFont("helvetica", "bold");
pdf.setFontSize(10);
pdf.setTextColor(25, 25, 25);

pdf.text(
  `${fmtPDF(shown.sh2 ?? 0)} m³`,
  margin + 4,
  y + 34
);

pdf.text(
  `${fmtPDF(shown.vReal2 ?? 0)} m³`,
  shotcreteMidX + 4,
  y + 34
);

y += shotcreteBoxHeight + 5;

  // ─────────────────────────────────────────────
// CALIBRADORES
// ─────────────────────────────────────────────

const calibBoxHeight = 20;

pdf.setDrawColor(150, 150, 150);
pdf.setLineWidth(0.4);

pdf.rect(
  margin,
  y,
  contentWidth,
  calibBoxHeight
);

// Título
pdf.setFont("helvetica", "bold");
pdf.setFontSize(9);
pdf.setTextColor(35, 35, 35);

pdf.text(
  "CALIBRADORES",
  margin + 4,
  y + 6
);

// Valor
pdf.setFont("helvetica", "bold");
pdf.setFontSize(12);
pdf.setTextColor(25, 25, 25);

pdf.text(
  `${shown.calib ?? 0} UND`,
  margin + contentWidth - 4,
  y + 14,
  {
    align: "right",
  }
);

y += calibBoxHeight + 5;
}

// MALLA
if (mode === "malla") {
  const colWidth = contentWidth / 2;

  // ─────────────────────────────────────────────
  // PERÍMETRO / ÁREA
  // ─────────────────────────────────────────────

  const mainBoxHeight = 28;

  pdf.setDrawColor(150, 150, 150);
  pdf.setLineWidth(0.4);

  pdf.rect(
    margin,
    y,
    contentWidth,
    mainBoxHeight
  );

  pdf.line(
    margin + colWidth,
    y,
    margin + colWidth,
    y + mainBoxHeight
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(60, 60, 60);

  pdf.text(
    "PERÍMETRO",
    margin + 3,
    y + 6
  );

  pdf.text(
    "ÁREA",
    margin + colWidth + 3,
    y + 6
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(25, 25, 25);

  pdf.text(
    `${fmtPDF(shown.P)} m`,
    margin + 3,
    y + 19
  );

  pdf.text(
    `${fmtPDF(shown.area)} m²`,
    margin + colWidth + 3,
    y + 19
  );

  y += mainBoxHeight + 8;

  // ─────────────────────────────────────────────
  // VOLUMEN DE MALLA
  // ─────────────────────────────────────────────

  const volumeBoxHeight = 28;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(35, 35, 35);

  pdf.rect(
    margin,
    y,
    contentWidth,
    volumeBoxHeight
  );

  pdf.text(
    "VOLUMEN DE MALLA",
    margin + 3,
    y + 6
  );

  pdf.setFontSize(13);
  pdf.setTextColor(25, 25, 25);

  pdf.text(
    `${fmtPDF(shown.vMalla ?? 0, 2)} m³`,
    pageWidth / 2,
    y + 20,
    {
      align: "center",
    }
  );

  y += volumeBoxHeight;
}

  // RESANE
if (mode === "resane") {
  const colWidth = contentWidth / 2;

  // ─────────────────────────────────────────────
  // PERÍMETRO / ÁREA
  // ─────────────────────────────────────────────

  const mainBoxHeight = 28;

  pdf.setDrawColor(150, 150, 150);
  pdf.setLineWidth(0.4);

  pdf.rect(
    margin,
    y,
    contentWidth,
    mainBoxHeight
  );

  pdf.line(
    margin + colWidth,
    y,
    margin + colWidth,
    y + mainBoxHeight
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(60, 60, 60);

  pdf.text(
    "PERÍMETRO",
    margin + 3,
    y + 6
  );

  pdf.text(
    "ÁREA",
    margin + colWidth + 3,
    y + 6
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(25, 25, 25);

  pdf.text(
    `${fmtPDF(shown.P)} m`,
    margin + 3,
    y + 19
  );

  pdf.text(
    `${fmtPDF(shown.area)} m²`,
    margin + colWidth + 3,
    y + 19
  );

  y += mainBoxHeight + 8;

  // ─────────────────────────────────────────────
  // VOLUMEN DE RESANE
  // ─────────────────────────────────────────────

  const volumeBoxHeight = 28;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(35, 35, 35);

  pdf.rect(
    margin,
    y,
    contentWidth,
    volumeBoxHeight
  );

  pdf.text(
    "VOLUMEN DE RESANE",
    margin + 3,
    y + 6
  );

  pdf.setFontSize(13);
  pdf.setTextColor(25, 25, 25);

  pdf.text(
    `${fmtPDF(shown.vResane ?? 0)} m³`,
    pageWidth / 2,
    y + 20,
    {
      align: "center",
    }
  );

  y += volumeBoxHeight + 8;

  // ─────────────────────────────────────────────
  // CALIBRADORES
  // ─────────────────────────────────────────────

  const calibBoxHeight = 28;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(35, 35, 35);

  pdf.rect(
    margin,
    y,
    contentWidth,
    calibBoxHeight
  );

  pdf.text(
    "CALIBRADORES",
    margin + 3,
    y + 6
  );

  pdf.setFontSize(13);
  pdf.setTextColor(25, 25, 25);

  pdf.text(
    `${shown.calib ?? 0} UND`,
    pageWidth / 2,
    y + 20,
    {
      align: "center",
    }
  );

  y += calibBoxHeight;
}

// ─────────────────────────────────────────────
// OBSERVACIONES
// ─────────────────────────────────────────────

const observationsBoxHeight = 30;

pdf.setDrawColor(150, 150, 150);
pdf.setLineWidth(0.4);

pdf.rect(
  margin,
  y,
  contentWidth,
  observationsBoxHeight
);

pdf.setFont("helvetica", "bold");
pdf.setFontSize(9);
pdf.setTextColor(35, 35, 35);

pdf.text(
  "OBSERVACIONES",
  margin + 4,
  y + 6
);

pdf.setFont("helvetica", "normal");
pdf.setFontSize(9);
pdf.setTextColor(50, 50, 50);

const observationText =
  observaciones.trim() || "Sin observaciones";

const observationLines = pdf.splitTextToSize(
  observationText,
  contentWidth - 8
);

pdf.text(
  observationLines.slice(0, 3),
  margin + 4,
  y + 12
);

y += observationsBoxHeight + 4;

  // ─────────────────────────────────────────────
  // FOTOS
  // ─────────────────────────────────────────────

  if (photos.length > 0) {
    pdf.addPage();

    const drawPhotoHeader = () => {
  pdf.setFillColor(35, 35, 35);
  pdf.rect(0, 0, pageWidth, 28, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);

  pdf.text(
    "EVIDENCIA FOTOGRÁFICA",
    margin,
    11
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);

  pdf.text(
    `Labor: ${labor || "—"}`,
    margin,
    21
  );

  pdf.text(
    `Fecha: ${date}`,
    pageWidth - margin,
    21,
    {
      align: "right",
    }
  );
};

    drawPhotoHeader();

    const maxPhotoWidth = contentWidth;
const maxPhotoHeight = 108;

const photoGap = 10;
const startY = 34;
const rowHeight = maxPhotoHeight + photoGap + 8;

photos.forEach((photo, index) => {
  // 2 fotografías por página
  if (index > 0 && index % 2 === 0) {
    pdf.addPage();
    drawPhotoHeader();
  }

  const position = index % 2;
  const photoY = startY + position * rowHeight;

  try {
    const imageFormat = photo.startsWith("data:image/png")
      ? "PNG"
      : "JPEG";

    // Obtener dimensiones reales de la imagen
    const imageProperties =
      pdf.getImageProperties(photo);

    const imageRatio =
      imageProperties.width /
      imageProperties.height;

    // Tamaño inicial: máximo ancho disponible
    let photoWidth = maxPhotoWidth;
    let photoHeight = photoWidth / imageRatio;

    // Reducir si supera la altura máxima
    // manteniendo la proporción original.
    if (photoHeight > maxPhotoHeight) {
      photoHeight = maxPhotoHeight;
      photoWidth = photoHeight * imageRatio;
    }

    // Centrar horizontalmente
    const x =
      margin +
      (contentWidth - photoWidth) / 2;

    // Borde de la fotografía
    pdf.setDrawColor(190, 190, 190);
    pdf.rect(
      x,
      photoY,
      photoWidth,
      photoHeight
    );

    // Fotografía
    pdf.addImage(
      photo,
      imageFormat,
      x,
      photoY,
      photoWidth,
      photoHeight
    );

    // Franja inferior
    pdf.setFillColor(35, 35, 35);
    pdf.rect(
      x,
      photoY + photoHeight - 7,
      photoWidth,
      7,
      "F"
    );

    // Texto de identificación
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);

    pdf.text(
      `FOTO ${index + 1}`,
      x + photoWidth / 2,
      photoY + photoHeight - 2.5,
      { align: "center" }
    );
  } catch {
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);

    pdf.text(
      `No se pudo cargar la foto ${index + 1}`,
      margin,
      photoY + 20
    );
  }
});
  }

  // ─────────────────────────────────────────────
  // PIE DE PÁGINA
  // ─────────────────────────────────────────────

  const totalPages = pdf.getNumberOfPages();

  for (let page = 1; page <= totalPages; page++) {
    pdf.setPage(page);

    pdf.setDrawColor(200, 200, 200);
    pdf.line(
      margin,
      pageHeight - 13,
      pageWidth - margin,
      pageHeight - 13
    );

    pdf.setTextColor(90, 90, 90);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);

    pdf.text(
      "UM CHUNGAR — Cálculo volumen de Shotcrete",
      margin,
      pageHeight - 7
    );

    pdf.text(
      `Página ${page} de ${totalPages}`,
      pageWidth - margin,
      pageHeight - 7,
      { align: "right" }
    );
  }

  return { pdf, fileName, date };
};

const generatePDF = async () => {
  const result = buildPDF();

  if (!result) return;

  try {
    const isNative =
      typeof window !== "undefined" &&
      (window as any).Capacitor?.isNativePlatform?.();

    if (isNative) {
      const base64 = result.pdf
        .output("datauristring")
        .split(",")[1];

      await Filesystem.writeFile({
        path: `PDR Shotcrete/${result.fileName}`,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });

      toast.success(
        "PDF guardado correctamente en Documentos"
      );

      return;
    }

    // Navegador / PWA / Vercel
    result.pdf.save(result.fileName);

    toast.success("PDF descargado correctamente");
  } catch (error) {
    console.error("Error al generar PDF:", error);

    toast.error("No se pudo generar el PDF");
  }
};

const sharePDF = async () => {
  const result = buildPDF();

  if (!result) return;

  const { pdf, fileName, date } = result;

  try {
    const isNative =
      typeof window !== "undefined" &&
      (window as any).Capacitor?.isNativePlatform?.();

    const shareText = `Cálculo volumen de Shotcrete

Nivel: ${nivel || "—"}
Labor: ${labor || "—"}
Fecha: ${date}`;

    // ─────────────────────────────────────────────
    // APK / ANDROID
    // ─────────────────────────────────────────────

    if (isNative) {
      const base64 = pdf
        .output("datauristring")
        .split(",")[1];

      await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });

      const fileUri = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache,
      });

      const canShare = await Share.canShare();

      if (!canShare.value) {
        toast.error(
          "Este dispositivo no permite compartir archivos"
        );
        return;
      }

      await Share.share({
        title: "Cálculo volumen de Shotcrete",
        text: shareText,
        files: [fileUri.uri],
        dialogTitle: "Compartir PDF",
      });

      return;
    }

    // ─────────────────────────────────────────────
    // VERCEL / PWA / NAVEGADOR
    // ─────────────────────────────────────────────

    const blob = pdf.output("blob");

    const file = new File(
      [blob],
      fileName,
      {
        type: "application/pdf",
      }
    );

    // Compartir archivo desde el navegador
    if (
      typeof navigator !== "undefined" &&
      navigator.share &&
      navigator.canShare?.({ files: [file] })
    ) {
      await navigator.share({
        title: "Cálculo volumen de Shotcrete",
        text: shareText,
        files: [file],
      });

      return;
    }

    // Si el navegador no permite compartir archivos,
    // descargamos el PDF como alternativa.
    pdf.save(fileName);

    toast.success(
      "El navegador no permite compartir archivos. PDF descargado."
    );
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /cancel|dismiss/i.test(error.message))) return;
    console.error("Error al compartir PDF:", error);
    toast.error("No se pudo compartir el PDF. Prueba Descargar PDF.");
  }
};

    const copyReport = async () => {
    if (!shown) return;

    const lines =
      mode === "avance"
  ? [
      "REPORTE SHOTCRETE — MODO AVANCE",
      `Labor: ${labor}`,
      `Nivel: ${nivel}`,
      `H: ${fmt2(average(h))} m | A: ${fmt2(average(a))} m | L: ${fmt2(average(l))} m`,
      `Espesor: ${espesor}"`,
      `Perímetro: ${fmt2(shown.P)} m`,
      `Área: ${fmt2(shown.area)} m²`,
      `SH Sacrificio 1": ${fmt(shown.sh1 ?? 0)} m³`,
      `M³ Labor: ${fmt(shown.vReal1 ?? 0)} m³`,
      `SH Sacrificio 2": ${fmt(shown.sh2 ?? 0)} m³`,
      `M³ Labor: ${fmt(shown.vReal2 ?? 0)} m³`,
      `Calibradores: ${shown.calib ?? 0} und`,
    ]
        : mode === "malla"
          ? [
              "REPORTE SHOTCRETE — MODO MALLA",
              `Labor: ${labor}`,
              `Nivel: ${nivel}`,
              `H: ${fmt2(average(h))} m | A: ${fmt2(average(a))} m | L: ${fmt2(average(l))} m`,
              `Perímetro: ${fmt2(shown.P)} m`,
              `Área: ${fmt2(shown.area)} m²`,
              `Volumen de malla: ${fmt(shown.vMalla ?? 0, 2)} m³`,
            ]
          : [
              "REPORTE SHOTCRETE — MODO RESANE",
              `Labor: ${labor}`,
              `Nivel: ${nivel}`,
              `H: ${fmt2(average(h))} m | L: ${fmt2(average(l))} m`,
              `Área: ${fmt2(shown.area)} m²`,
              `Volumen de resane: ${fmt2(shown.vResane ?? 0)} m³`,
              `Calibradores: ${shown.calib} und`,
            ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      toast.success("Reporte copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="h-1 bg-primary" />
      <div className="relative flex min-h-20 items-center border-b border-border px-4 py-4 sm:px-6">
  <div className="pr-12">
    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">01 · CUBICACIÓN</p>
    <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-tight text-foreground sm:text-3xl">Calculadora de shotcrete</h2>
    <p className="mt-1 text-xs text-muted-foreground">Registra las medidas y obtiene el volumen de aplicación.</p>
  </div>

  <div className="absolute right-3 top-3">
    <button
      type="button"
      onClick={() => setShowMenu((value) => !value)}
      aria-label="Abrir menú"
      aria-expanded={showMenu}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      ⋮
    </button>

    {showMenu && (
      <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border-2 border-border bg-card shadow-xl">
        <button
          type="button"
          onClick={() => {
            setShowRendimientos(true);
            setShowMenu(false);
          }}
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-foreground transition-colors hover:bg-secondary"
        >
          <span className="text-base">⚙</span>
          <span>Rendimientos</span>
        </button>
      </div>
    )}
  </div>
</div>

{showRendimientos && (
  <div className="border-t-2 border-border bg-secondary/40 px-4 py-4 sm:px-6">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-extrabold uppercase tracking-widest text-foreground">
          RENDIMIENTOS
        </p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          m² por m³ según espesor
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowRendimientos(false)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-input text-xl font-bold text-muted-foreground hover:border-destructive hover:text-destructive"
        aria-label="Cerrar rendimientos"
      >
        ×
      </button>
    </div>

    <div className="space-y-2">
      {["1", "1.5", "2", "3", "4"].map((key) => (
        <div
          key={key}
          className="flex items-center justify-between gap-3 rounded-lg border-2 border-input bg-background px-3 py-2"
        >
          <span className="text-sm font-bold text-foreground">
            {key}"
          </span>

          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="any"
            value={rendimientosDraft[key] ?? ""}
            onChange={(e) => {
              setRendimientosDraft((current) => ({
                ...current,
                [key]: e.target.value,
              }));
              invalidateCalculation();
            }}
            className="h-10 w-28 rounded-lg border-2 border-input bg-secondary px-3 text-right text-base font-bold tabular-nums text-foreground outline-none focus:border-primary"
          />

          <span className="w-12 text-xs font-bold text-muted-foreground">
            m²/m³
          </span>
        </div>
      ))}
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={resetRendimientos}
        className="h-11 rounded-lg border-2 border-input bg-transparent text-xs font-bold uppercase text-muted-foreground hover:border-destructive hover:text-destructive"
      >
        Restablecer
      </button>

      <button
        type="button"
        onClick={saveRendimientos}
        className="h-11 rounded-lg bg-primary text-xs font-bold uppercase text-primary-foreground hover:brightness-110"
      >
        Guardar
      </button>
    </div>
  </div>
)}

      {/* Mode switcher */}
<div className="px-4 pb-5 pt-5 sm:px-6">
  <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
    USO
  </p>

  <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-background p-1.5">
    {(["avance", "resane", "malla"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
  setMode(m);
  setH([""]);
  setA([""]);
  setL([""]);
  setCalculated(false);
  setResult(null);
  setPhotos([]);
}}
            className={`min-h-12 rounded-lg px-1 font-display text-lg font-bold uppercase tracking-wide transition-colors sm:text-xl ${
              mode === m
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {m}
          </button>
                ))}
      </div>
</div>

{/* Datos del operador */}
<div className="relative border-t border-border px-4 pb-5 pt-5 sm:px-6">
  <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
    01 · DATOS DEL OPERADOR
  </p>

  <div>
    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
      OPERADOR
    </label>

    <input
      type="text"
      value={operador}
      onChange={(e) => setOperador(e.target.value)}
      placeholder=""
      className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-medium text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
    />
  </div>
</div>

{/* Inputs */}
<div className="border-t border-border px-4 pb-5 pt-5 sm:px-6">
  <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
    02 · DATOS DE LA LABOR
  </p>

  <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3">
    <div>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        NIVEL
      </label>

      <input
        type="text"
        value={nivel}
        onChange={(e) => setNivel(e.target.value)}
        placeholder=""
        className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-medium text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </div>

    <div>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        LABOR
      </label>

      <input
        type="text"
        value={labor}
        onChange={(e) => setLabor(e.target.value)}
        placeholder=""
        className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-medium text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </div>
    </div>
</div>

<div className="border-t border-border px-4 pb-5 pt-5 sm:px-6">
  <div className="mb-3 flex items-center justify-between gap-3">
    <div>
      <p className="text-sm font-bold uppercase tracking-wider text-foreground">MEDICIONES</p>
      <p className="mt-1 text-xs text-muted-foreground">Ingresa las dimensiones en metros. Puedes añadir más lecturas.</p>
    </div>
    <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[11px] font-bold text-muted-foreground">m</span>
  </div>
  <div className={`grid gap-2 ${mode === "resane" ? "grid-cols-2" : "grid-cols-3"}`}>
    {([
      { key: "h", label: "ALTURA", symbol: "H", values: h, setter: setH },
      ...(mode === "avance" || mode === "malla"
        ? [{ key: "a", label: "ANCHO", symbol: "A", values: a, setter: setA }]
        : []),
      { key: "l", label: "AVANCE", symbol: "L", values: l, setter: setL },
    ] as const).map((item) => (
      <div key={item.key} className="min-w-0 rounded-xl border border-border bg-background/60 p-2.5 sm:p-3">
        <div className="mb-2 flex items-center justify-between gap-1">
          <span className="truncate text-[11px] font-bold uppercase tracking-wide text-foreground sm:text-xs">{item.label}</span>
          <button
            type="button"
            onClick={() => addMeasurement(item.setter)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-sm font-semibold leading-none text-primary transition-colors hover:bg-primary/20"
            aria-label={`Agregar medición de ${item.label.toLowerCase()}`}
            title="Agregar medición"
          >+</button>
        </div>
        <div className="space-y-2">
          {item.values.map((value, index) => (
            <div key={index} className="min-w-0">
              {item.values.length > 1 && <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">{item.symbol}{index + 1}</label>}
              <div className="flex min-w-0 items-center gap-1">
                <div className="min-w-0 flex-1">
                  <Field
                    fieldKey={item.key}
                    value={value}
                    onChange={(v) => {
                      item.setter((values: string[]) => values.map((old, i) => i === index ? v : old));
                      invalidateCalculation();
                    }}
                  />
                </div>
                {item.values.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMeasurement(item.setter, index)}
                    className="flex h-10 w-6 shrink-0 items-center justify-center rounded-md text-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Eliminar ${item.symbol}${index + 1}`}
                  >−</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-border/70 pt-2 text-[10px] font-semibold text-muted-foreground sm:text-xs">
          Prom. <span className="font-bold tabular-nums text-foreground">{average(item.values).toFixed(2)} m</span>
        </div>
      </div>
    ))}
  </div>
</div>
{(mode === "avance" || mode === "malla") && (
  <div className="border-t border-border px-4 pb-5 pt-5 sm:px-6">
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
      04 · PARÁMETRO DEL CÁLCULO
    </p>

    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 sm:px-4">
      <label
        htmlFor="espesor"
        className="text-sm font-extrabold uppercase tracking-wide text-foreground"
      >
        ESPESOR <span className="text-steel">(pulg)</span>
      </label>

      <select
        id="espesor"
        value={espesor}
        onChange={(e) => {
          setEspesor(e.target.value);
          invalidateCalculation();
        }}
        className="h-11 w-28 rounded-lg border border-input bg-card px-3 text-center text-lg font-bold tabular-nums text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
      >
        <option value="1">1"</option>
        <option value="1.5">1.5"</option>
        <option value="2">2"</option>
        <option value="3">3"</option>
        <option value="4">4"</option>
      </select>
    </div>
  </div>
)}

<div className="border-t-2 border-border px-4 pb-4 pt-5 sm:px-6">
  <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
    OBSERVACIONES
  </p>

  <textarea
    value={observaciones}
    onChange={(e) => {
      setObservaciones(e.target.value);
      invalidateCalculation();
    }}
    rows={3}
    placeholder="Observaciones de la labor (opcional)"
    className="w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm font-medium leading-relaxed text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
  />
</div>

<div className="flex flex-col gap-3 border-t border-border px-4 pb-6 pt-5 sm:flex-row sm:px-6">
  <button
    onClick={calculate}
    className="flex h-14 w-full items-center justify-center rounded-xl bg-primary font-display text-xl font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:brightness-110 sm:flex-1"
  >
    CALCULAR
  </button>

  <button
    onClick={reset}
    className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-input bg-secondary font-bold uppercase tracking-wide text-foreground transition-colors hover:border-destructive hover:text-destructive sm:w-auto sm:px-8"
  >
    <RotateCcw className="size-5" />
    LIMPIAR
  </button>
</div>

            {/* Results */}
{shown && (
  <div
    ref={resultsRef}
    className="border-t border-border bg-background/35 px-4 py-6 sm:px-6"
  >
    <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
      <p className="font-display text-2xl font-bold uppercase tracking-wide text-primary">
        RESULTADOS
      </p>
    </div>
          {mode === "avance" ? (
            <div className="space-y-4">
  {/* Fila 1: datos generales */}
  <div className="space-y-3">
  <div className="grid grid-cols-2 gap-3">
    <ResultCard
      label="Perímetro"
      value={fmt2(shown.P)}
      unit="m"
    />

    <ResultCard
      label="Área"
      value={fmt2(shown.area)}
      unit="m²"
    />
  </div>

</div>

  {/* Cálculo Shotcrete — Sacrificio 1" */}
<div className="border-t-2 border-border pt-5">
  <p className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
    Cálculo Shotcrete — Sacrificio 1"
  </p>

  <div className="grid grid-cols-2 gap-3">
    <ResultCard
  label='SH SACRIFICIO 1"'
  value={fmt(shown.sh1)}
  unit="m³"
  mediumHighlight
/>

    <ResultCard
      label='M³ LABOR'
      value={fmt(shown.vReal1)}
      unit="m³"
      highlight
    />
  </div>
</div>

  {/* Cálculo Shotcrete — Sacrificio 2" */}
<div className="border-t-2 border-border pt-5">
  <p className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
    Cálculo Shotcrete — Sacrificio 2"
  </p>

  <div className="grid grid-cols-2 gap-3">
    <ResultCard
  label='SH SACRIFICIO 2"'
  value={fmt(shown.sh2)}
  unit="m³"
  mediumHighlight
/>

    <ResultCard
      label='M³ LABOR'
      value={fmt(shown.vReal2)}
      unit="m³"
      highlight
    />
  </div>
</div>

  {/* Calibradores */}
<div className="border-t-2 border-border pt-5">
  <p className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
    CALIBRADORES
  </p>

  <ResultCard
    label="Calibradores"
    value={`${shown.calib}`}
    unit="und"
    highlight
  />
</div>
</div>
                                        ) : mode === "malla" ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <ResultCard
                label="Perímetro"
                value={fmt2(shown.P)}
                unit="m"
              />

              <ResultCard
                label="Área"
                value={fmt2(shown.area)}
                unit="m²"
              />

              <ResultCard
                label="Vol. Malla"
                value={fmt(shown.vMalla, 2)}
                unit="m³"
                highlight
              />
            </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <ResultCard
                  label="Perímetro"
                  value={fmt2(shown.P)}
                  unit="m"
                />
                <ResultCard
                  label="Área"
                  value={fmt2(shown.area)}
                  unit="m²"
                />
                <ResultCard
                  label="Vol. resane"
                  value={fmt2(shown.vResane)}
                  unit="m³"
                  highlight
                />
                <ResultCard
                  label="Calibradores"
                  value={`${shown.calib}`}
                  unit="und"
                  highlight
                />
              </div>
            )}


          {/* Verification table */}
<div className="mt-6 overflow-x-auto rounded-xl border border-border">
  <table className="w-full text-left text-xs sm:text-sm">
    <thead>
      <tr className="bg-secondary/70 text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">
        <th className="px-2.5 py-3 sm:px-4">Concepto</th>
        <th className="px-2.5 py-3 sm:px-4 text-right">Valor</th>
        <th className="px-2.5 py-3 sm:px-4 text-right">Unidad</th>
      </tr>
    </thead>

    <tbody className="tabular-nums">
      <tr className="border-t border-border">
        <td className="px-2.5 py-2.5 sm:px-4">
          Perímetro
        </td>
        <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold">
          {fmt2(shown.P)}
        </td>
        <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
          m
        </td>
      </tr>

      <tr className="border-t border-border">
        <td className="px-2.5 py-2.5 sm:px-4">
          Área
        </td>
        <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold">
          {fmt2(shown.area)}
        </td>
        <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
          m²
        </td>
      </tr>

      {mode === "avance" ? (
        <>

          <tr className="border-t border-border">
            <td className="px-2.5 py-2.5 sm:px-4">
              SH SACRIFICIO 1"
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold text-primary">
              {fmt(shown.sh1)}
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
              m³
            </td>
          </tr>

          <tr className="border-t border-border">
            <td className="px-2.5 py-2.5 sm:px-4">
              M³ Labor 1
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold text-primary">
              {fmt(shown.vReal1)}
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
              m³
            </td>
          </tr>

          <tr className="border-t border-border">
            <td className="px-2.5 py-2.5 sm:px-4">
              SH SACRIFICIO 2"
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold text-primary">
              {fmt(shown.sh2)}
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
              m³
            </td>
          </tr>

          <tr className="border-t border-border">
            <td className="px-2.5 py-2.5 sm:px-4">
              M³ Labor 2
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold text-primary">
              {fmt(shown.vReal2)}
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
              m³
            </td>
          </tr>

          <tr className="border-t border-border bg-primary/5">
            <td className="px-2.5 py-2.5 sm:px-4">
              Calibradores
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold text-primary">
              {shown.calib}
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
              und
            </td>
          </tr>
        </>
      ) : mode === "malla" ? (
        <tr className="border-t border-border bg-primary/5">
          <td className="px-2.5 py-2.5 sm:px-4">
            Volumen de malla
          </td>
          <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold text-primary">
            {fmt(shown.vMalla, 2)}
          </td>
          <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
            m³
          </td>
        </tr>
      ) : (
        <>
          <tr className="border-t border-border bg-primary/5">
            <td className="px-2.5 py-2.5 sm:px-4">
              Volumen de resane (Área / 11.5)
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold text-primary">
              {fmt2(shown.vResane)}
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
              m³
            </td>
          </tr>

          <tr className="border-t border-border bg-primary/5">
            <td className="px-2.5 py-2.5 sm:px-4">
              Calibradores
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right font-bold text-primary">
              {shown.calib}
            </td>
            <td className="px-2.5 py-2.5 sm:px-4 text-right text-muted-foreground">
              und
            </td>
          </tr>
        </>
      )}
    </tbody>
  </table>
</div>

{/* Evidencia fotográfica */}
<div className="mt-6 border-t border-border pt-6">
  <div className="mb-3">
    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
      EVIDENCIA FOTOGRÁFICA
    </p>

    <p className="mt-1 text-xs text-muted-foreground">
      Agrega fotografías de la labor para incluirlas en el PDF.
    </p>
  </div>

  <div className="grid grid-cols-2 gap-3">
    <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-2 text-xs font-bold uppercase text-primary-foreground sm:text-sm">
      <Camera className="size-5" />
      Tomar foto

      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={photosLimitReached}
        className="hidden"
        onChange={(e) => {
          addPhotos(e.target.files);
          e.currentTarget.value = "";
        }}
      />
    </label>

    <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-input bg-secondary px-2 text-xs font-bold uppercase text-foreground sm:text-sm">
      <ImagePlus className="size-5" />
      Galería

      <input
        type="file"
        accept="image/*"
        multiple
        disabled={photosLimitReached}
        className="hidden"
        onChange={(e) => {
          addPhotos(e.target.files);
          e.currentTarget.value = "";
        }}
      />
    </label>
  </div>

  {photos.length > 0 && (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo, index) => (
        <div
          key={index}
          className="relative overflow-hidden rounded-lg border-2 border-border bg-secondary"
        >
          <img
            src={photo}
            alt={`Evidencia ${index + 1}`}
            className="aspect-square w-full object-cover"
          />

          <button
            type="button"
            onClick={() => removePhoto(index)}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-white shadow-lg"
            aria-label={`Eliminar foto ${index + 1}`}
          >
            <X className="size-4" />
          </button>

          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-center text-xs font-bold text-white">
            Foto {index + 1}
          </div>
        </div>
      ))}
    </div>
  )}
</div>

{modeloDisponible && (
  <div className="mt-6">
    <PilotoLabor3D ancho={ancho3D} alto={alto3D} longitud={largo3D} />
  </div>
)}

<button
  onClick={generatePDF}
  className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 font-display text-lg font-bold uppercase tracking-wide text-primary transition-colors hover:bg-primary/20"
>
  Descargar PDF
</button>

<button
  onClick={sharePDF}
  className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 font-display text-lg font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:brightness-110"
>
  Compartir PDF
</button>

          <button
            onClick={copyReport}
            className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 font-display text-lg font-bold uppercase tracking-wide text-foreground transition-colors hover:bg-secondary/80"
          >
            {copied ? (
              <Check className="size-5" />
            ) : (
              <ClipboardCopy className="size-5" />
            )}
            {copied ? "¡Copiado!" : "Copiar reporte"}
          </button>
                </div>
      )}
    </div>
  );
}
