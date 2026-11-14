/** Delivery only: PDF content and all shotcrete calculations stay in the calculator. */
export type PdfDeliveryResult =
  "shared" | "downloaded" | "saved" | "downloaded-fallback" | "saved-fallback" | "cancelled";

export interface PdfDeliveryPorts {
  native: boolean;
  web: {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  download: () => void | Promise<unknown>;
  saveDocuments: () => Promise<void>;
  canShareNative: () => Promise<boolean>;
  writeCache: () => Promise<string>;
  shareNative: (uri: string) => Promise<void>;
}

export function pdfFileName(labor: string, nivel: string, date: string): string {
  const segment = (value: string, fallback: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || fallback;
  return `Shotcrete_${segment(nivel, "Sin_nivel")}_${segment(labor, "Sin_labor")}_${segment(date, "Reporte")}.pdf`;
}

export function isShareCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; code?: string; message?: string };
  return (
    value.name === "AbortError" ||
    value.code === "USER_CANCELLED" ||
    value.code === "USER_CANCELED" ||
    /^(share |sharing |user )?cancel(l)?ed[.!]?$/i.test(value.message?.trim() ?? "")
  );
}

/** Web share is invoked before any await to retain the tap's transient activation. */
export async function deliverPdf(
  action: "download" | "share",
  data: ShareData,
  ports: PdfDeliveryPorts,
): Promise<PdfDeliveryResult> {
  const save = async (fallback: boolean): Promise<PdfDeliveryResult> => {
    if (ports.native) {
      await ports.saveDocuments();
      return fallback ? "saved-fallback" : "saved";
    }
    await ports.download();
    return fallback ? "downloaded-fallback" : "downloaded";
  };
  if (action === "download") return save(false);
  try {
    if (ports.native) {
      if (!(await ports.canShareNative())) return save(true);
      const uri = await ports.writeCache();
      await ports.shareNative(uri);
      return "shared";
    }
    if (ports.web.share && ports.web.canShare?.(data.files ? { files: data.files } : {})) {
      await ports.web.share(data);
      return "shared";
    }
  } catch (error) {
    if (isShareCancellation(error)) return "cancelled";
    // Preserve a usable copy when the OS/share target cannot accept the file.
  }
  return save(true);
}
