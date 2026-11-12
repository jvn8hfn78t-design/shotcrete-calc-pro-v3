type Trama = { ancho: number; alto: number; datos: Uint8ClampedArray };
type Punto = { x: number; y: number };

function gris(f: Trama) {
  const g = new Uint8Array(f.ancho * f.alto);
  for (let i = 0; i < g.length; i++) {
    const j = i * 4;
    g[i] = (77 * f.datos[j] + 150 * f.datos[j + 1] + 29 * f.datos[j + 2]) >> 8;
  }
  return g;
}

function buscar(a: Uint8Array, b: Uint8Array, w: number, h: number, p: Punto) {
  let mejor = Infinity;
  let alternativa = Infinity;
  let punto = p;
  const candidatos: { x: number; y: number; error: number }[] = [];
  for (let y = Math.max(4, p.y - 24); y <= Math.min(h - 5, p.y + 24); y++) {
    for (let x = Math.max(4, p.x - 24); x <= Math.min(w - 5, p.x + 24); x++) {
      let error = 0;
      for (let dy = -4; dy <= 4; dy += 2) {
        for (let dx = -4; dx <= 4; dx += 2) {
          error += Math.abs(a[(p.y + dy) * w + p.x + dx] - b[(y + dy) * w + x + dx]);
        }
      }
      candidatos.push({ x, y, error });
      if (error < mejor) { mejor = error; punto = { x, y }; }
    }
  }
  for (const c of candidatos) {
    if (Math.abs(c.x - punto.x) > 2 || Math.abs(c.y - punto.y) > 2)
      alternativa = Math.min(alternativa, c.error);
  }
  return mejor < 25 * 18 && mejor < alternativa * 0.75 ? punto : null;
}

self.onmessage = (e: MessageEvent<{ primera: Trama; segunda: Trama }>) => {
  const { primera, segunda } = e.data;
  const { ancho: w, alto: h } = primera;
  const a = gris(primera), b = gris(segunda);
  const pares: { a: Punto; b: Punto }[] = [];
  for (let y = 8; y < h - 8; y += 24) {
    for (let x = 8; x < w - 8; x += 24) {
      const p = { x, y };
      const q = buscar(a, b, w, h, p);
      if (!q) continue;
      const vuelta = buscar(b, a, w, h, q);
      if (vuelta && Math.hypot(vuelta.x - x, vuelta.y - y) <= 1.5)
        pares.push({ a: p, b: q });
    }
  }
  self.postMessage(pares);
};

export {};
