type Trama = { ancho: number; alto: number; datos: Uint8ClampedArray };
type Punto = { x: number; y: number };
type Rasgo = Punto & { descriptor: Float32Array };

function extraer({ ancho: w, alto: h, datos }: Trama): Rasgo[] {
  const gris = new Float32Array(w * h);
  for (let i = 0; i < gris.length; i++) {
    gris[i] = (77 * datos[4*i] + 150 * datos[4*i+1] + 29 * datos[4*i+2]) / 256;
  }
  // Menor autovalor del tensor de gradientes: exige contraste en dos direcciones.
  const esquinas: (Punto & { fuerza: number })[] = [];
  const fuerza = new Float32Array(w*h);
  for (let y = 8; y < h-8; y++) {
    for (let x = 8; x < w-8; x++) {
      let xx = 0, yy = 0, xy = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const i = (y+dy)*w+x+dx;
          const gx = gris[i+1]-gris[i-1], gy = gris[i+w]-gris[i-w];
          xx += gx*gx; yy += gy*gy; xy += gx*gy;
        }
      }
      fuerza[y*w+x] = (xx+yy-Math.sqrt((xx-yy)**2+4*xy*xy))/2;
    }
  }
  for (let y = 9; y < h-9; y++) {
    for (let x = 9; x < w-9; x++) {
      const i = y*w+x, valor = fuerza[i];
      if (valor < 2200) continue;
      let maximo = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (fuerza[i+dy*w+dx] > valor) maximo = false;
      if (maximo) esquinas.push({ x, y, fuerza: valor });
    }
  }
  esquinas.sort((a,b) => b.fuerza-a.fuerza);
  const usados = new Uint8Array(w*h);
  const rasgos: Rasgo[] = [];
  for (const { x,y } of esquinas) {
    if (usados[y*w+x]) continue;
    const descriptor = new Float32Array(81);
    let suma = 0, k = 0;
    for (let dy = -8; dy <= 8; dy += 2)
      for (let dx = -8; dx <= 8; dx += 2) {
        const v = gris[(y+dy)*w+x+dx];
        descriptor[k++] = v; suma += v;
      }
    let norma = 0;
    for (let j = 0; j < k; j++) {
      descriptor[j] -= suma/k;
      norma += descriptor[j]**2;
    }
    if (norma < k*36) continue;
    norma = Math.sqrt(norma);
    for (let j = 0; j < k; j++) descriptor[j] /= norma;
    rasgos.push({ x,y,descriptor });
    for (let dy = -5; dy <= 5; dy++)
      usados.fill(1,(y+dy)*w+x-5,(y+dy)*w+x+6);
    if (rasgos.length === 400) break;
  }
  return rasgos;
}

function ranking() { return { indice: -1, mejor: Infinity, segundo: Infinity }; }
type Ranking = ReturnType<typeof ranking>;
function registrar(r: Ranking, indice: number, distancia: number) {
  if (distancia < r.mejor) {
    r.segundo = r.mejor; r.mejor = distancia; r.indice = indice;
  } else if (distancia < r.segundo) r.segundo = distancia;
}
function distintivo(r: Ranking) {
  return Number.isFinite(r.segundo) && r.mejor < 0.12 && r.mejor < 0.5*r.segundo;
}

self.onmessage = (e: MessageEvent<{ primera: Trama; segunda: Trama }>) => {
  const a = extraer(e.data.primera), b = extraer(e.data.segunda);
  const ida = a.map(ranking), vuelta = b.map(ranking);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let similitud = 0;
      for (let k = 0; k < 81; k++) similitud += a[i].descriptor[k]*b[j].descriptor[k];
      const distancia = Math.max(0, 1-similitud);
      registrar(ida[i],j,distancia); registrar(vuelta[j],i,distancia);
    }
  }
  const pares: { a: Punto; b: Punto }[] = [];
  for (let i = 0; i < a.length; i++) {
    const r = ida[i];
    if (!distintivo(r) || vuelta[r.indice].indice !== i || !distintivo(vuelta[r.indice])) continue;
    const q = b[r.indice];
    pares.push({ a: { x:a[i].x, y:a[i].y }, b: { x:q.x, y:q.y } });
  }
  // Un único detalle aislado no basta para contrastar un par de vistas.
  self.postMessage(pares.length >= 3 ? pares : []);
};
export {};
