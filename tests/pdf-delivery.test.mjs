import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
const source = readFileSync(new URL("../src/lib/pdf-delivery.ts", import.meta.url), "utf8");
const { deliverPdf, pdfFileName, isShareCancellation } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);
const file = new File(["%PDF-1.3"], "report.pdf", { type: "application/pdf" });
const data = { title: "Test", text: "Nivel 100", files: [file] };
function ports(overrides = {}) {
  const events = [];
  return {
    events,
    native: false,
    web: {
      canShare: () => true,
      share: async (payload) => {
        events.push("share");
        assert.equal(payload.files[0], file);
      },
    },
    download: () => events.push("download"),
    saveDocuments: async () => {
      events.push("documents");
    },
    canShareNative: async () => true,
    writeCache: async () => {
      events.push("cache");
      return "content://report";
    },
    shareNative: async (uri) => {
      assert.equal(uri, "content://report");
      events.push("native-share");
    },
    ...overrides,
  };
}
test("sanitizes path characters and accents in labor/nivel, bounds filename", () => {
  assert.equal(
    pdfFileName("../../Galería 120", "N / 250", "13/11/2026"),
    "Shotcrete_N_250_Galeria_120_13_11_2026.pdf",
  );
  assert.ok(pdfFileName("a".repeat(500), "b".repeat(500), "c".repeat(500)).length < 170);
  assert.equal(pdfFileName("", "", ""), "Shotcrete_Sin_nivel_Sin_labor_Reporte.pdf");
});
test("calls browser share immediately before yielding user activation", async () => {
  const p = ports();
  const pending = deliverPdf("share", data, p);
  assert.deepEqual(p.events, ["share"]);
  assert.equal(await pending, "shared");
});
test("unsupported browser produces a downloadable attachment", async () => {
  const p = ports({ web: { canShare: () => false } });
  assert.equal(await deliverPdf("share", data, p), "downloaded-fallback");
  assert.deepEqual(p.events, ["download"]);
});
test("web share cancellation does not download or report failure", async () => {
  const p = ports({
    web: {
      canShare: () => true,
      share: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    },
  });
  assert.equal(await deliverPdf("share", data, p), "cancelled");
  assert.deepEqual(p.events, []);
});
test("failed share falls back to download", async () => {
  const p = ports({
    web: {
      canShare: () => true,
      share: async () => {
        throw new Error("Target unavailable");
      },
    },
  });
  assert.equal(await deliverPdf("share", data, p), "downloaded-fallback");
  assert.deepEqual(p.events, ["download"]);
});
test("unsupported native share saves in documents without a useless cache copy", async () => {
  const p = ports({ native: true, canShareNative: async () => false });
  assert.equal(await deliverPdf("share", data, p), "saved-fallback");
  assert.deepEqual(p.events, ["documents"]);
});
test("native share uses actual file URI from cache", async () => {
  const p = ports({ native: true });
  assert.equal(await deliverPdf("share", data, p), "shared");
  assert.deepEqual(p.events, ["cache", "native-share"]);
});
test("native cancellation is quiet, real failure retains a documents copy", async () => {
  const p = ports({
    native: true,
    shareNative: async () => {
      throw new Error("Share canceled");
    },
  });
  assert.equal(await deliverPdf("share", data, p), "cancelled");
  assert.deepEqual(p.events, ["cache"]);
  const q = ports({
    native: true,
    shareNative: async () => {
      throw new Error("File target unavailable");
    },
  });
  assert.equal(await deliverPdf("share", data, q), "saved-fallback");
  assert.deepEqual(q.events, ["cache", "documents"]);
});
test("delivery/download errors propagate for a recoverable UI error", async () => {
  const p = ports({
    download: () => {
      throw new Error("disk");
    },
    web: {},
  });
  await assert.rejects(() => deliverPdf("share", data, p), /disk/);
});
test("explicit download respects platform", async () => {
  const web = ports(),
    native = ports({ native: true });
  assert.equal(await deliverPdf("download", data, web), "downloaded");
  assert.equal(await deliverPdf("download", data, native), "saved");
  assert.deepEqual(web.events, ["download"]);
  assert.deepEqual(native.events, ["documents"]);
});
test("cancellation detection is narrowly scoped", () => {
  assert.equal(isShareCancellation({ code: "USER_CANCELLED" }), true);
  assert.equal(isShareCancellation({ code: "USER_CANCELED" }), true);
  assert.equal(isShareCancellation(new Error("Server canceled request due to corruption")), false);
  assert.equal(isShareCancellation(null), false);
});
