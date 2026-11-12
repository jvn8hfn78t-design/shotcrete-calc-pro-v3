type Trama = { ancho: number; alto: number; datos: Uint8ClampedArray };
type Punto = { x: number; y: number };
type Rasgo = Punto & { descriptor: Float32Array };

// Diferencia de medias locales para localizar centros de manchas claras u oscuras.
function manchas(gris: Float32Array, w: number, h: number) {
  const paso = w + 1;
  const integral = new Float64Array(paso * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += gris[y*w+x];
      integral[(y+1)*paso+x+1] = integral[y*paso+x+1] + fila;
    }
  }
  function media(x: number, y: number, radio: number) {
    const a = (y-radio)*paso, b = (y+radio+1)*paso;
    const izq = x-radio, der = x+radio+1;
    return (integral[b+der]-integral[b+izq]-integral[a+der]+integral[a+izq]) / (2*radio+1)**2;
  }
  const candidatos: (Punto & { fuerza: number })[] = [];
  for (const radio of [2, 5]) {
    const borde = radio*2+1;
    const mapa = new Float32Array(w*h);
    for (let y = borde; y < h-borde; y++)
      for (let x = borde; x < w-borde; x++)
        mapa[y*w+x] = Math.abs(media(x,y,radio)-media(x,y,borde));
    const margen = Math.max(borde+2, 17);
    for (let y = margen; y < h-margen; y++) {
      for (let x = margen; x < w-margen; x++) {
        const i = y*w+x, v = mapa[i];
        if (v < 1.5) continue;
        let pico = true;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if ((dx || dy) && mapa[i+dy*w+dx] >= v) pico = false;
        if (!pico) continue;
        candidatos.push({ x, y, fuerza: v });
      }
    }
  }
  return candidatos.sort((a,b) => b.fuerza-a.fuerza);
}
function extraer({ ancho: w, alto: h, datos }: Trama) {
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
  function describir(candidatos: Punto[], salto: number, contraste: number, limite: number) {
    const rasgos: Rasgo[] = [];
    for (const { x,y } of candidatos) {
      if (usados[y*w+x]) continue;
      const descriptor = new Float32Array(81);
      let suma = 0, k = 0;
      for (let dy = -4*salto; dy <= 4*salto; dy += salto)
        for (let dx = -4*salto; dx <= 4*salto; dx += salto) {
          const v = gris[(y+dy)*w+x+dx];
          descriptor[k++] = v; suma += v;
        }
      let norma = 0;
      for (let j = 0; j < k; j++) {
        descriptor[j] -= suma/k;
        norma += descriptor[j]**2;
      }
      if (norma < k*contraste**2) continue;
      norma = Math.sqrt(norma);
      for (let j = 0; j < k; j++) descriptor[j] /= norma;
      rasgos.push({ x,y,descriptor });
      for (let dy = -5; dy <= 5; dy++)
        usados.fill(1,(y+dy)*w+x-5,(y+dy)*w+x+6);
      if (rasgos.length === limite) break;
    }
    return rasgos;
  }
  return { esquinas: describir(esquinas, 2, 6, 400), manchas: describir(manchas(gris,w,h), 4, 2, 180) };
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

function comparar(a: Rasgo[], b: Rasgo[]) {
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
  return pares;
}

self.onmessage = (e: MessageEvent<{ primera: Trama; segunda: Trama }>) => {
  const a = extraer(e.data.primera), b = extraer(e.data.segunda);
  const esquinas = comparar(a.esquinas,b.esquinas);
  const textura = comparar(a.manchas,b.manchas);
  const candidatos = [...esquinas,...textura];
  const apoyados = textura.filter(p => {
    let apoyo = 0;
    for (const q of candidatos) {
      const distancia = Math.hypot(q.a.x-p.a.x,q.a.y-p.a.y);
      if (distancia < 8 || distancia > 120) continue;
      const diferencia = Math.hypot(q.b.x-q.a.x-p.b.x+p.a.x,q.b.y-q.a.y-p.b.y+p.a.y);
      if (diferencia < 3 + distancia*0.08 && ++apoyo >= 2) return true;
    }
    return false;
  });
  const pares = [...esquinas,...apoyados];
  // Un único detalle aislado no basta para contrastar un par de vistas.
  self.postMessage(pares.length >= 3 ? pares : []);
};
export {};
