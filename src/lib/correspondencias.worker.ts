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
function extraer({ ancho: w, alto: h, datos }: Trama, suavizar = false) {
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
          const i = (y+dy)*w+x+dx;
          const v = suavizar ? (4*gris[i]+gris[i-1]+gris[i+1]+gris[i-w]+gris[i+w])/8 : gris[i];
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
function distintivo(r: Ranking, respaldo: boolean) {
  return Number.isFinite(r.segundo) && r.mejor < (respaldo ? 0.30 : 0.12) && r.mejor < (respaldo ? 0.72 : 0.5)*r.segundo;
}

function comparar(a: Rasgo[], b: Rasgo[], respaldo: boolean) {
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
    if (!distintivo(r,respaldo) || vuelta[r.indice].indice !== i || !distintivo(vuelta[r.indice],respaldo)) continue;
    const q = b[r.indice];
    pares.push({ a: { x:a[i].x, y:a[i].y }, b: { x:q.x, y:q.y } });
  }
  return pares;
}

function emparejar(a: ReturnType<typeof extraer>, b: ReturnType<typeof extraer>, respaldo = false) {
  const esquinas = comparar(a.esquinas,b.esquinas,respaldo);
  const textura = comparar(a.manchas,b.manchas,respaldo);
  const candidatos = [...esquinas,...textura];
  const apoyados = (respaldo ? candidatos : textura).filter(p => {
    let apoyo = 0;
    for (const q of candidatos) {
      const distancia = Math.hypot(q.a.x-p.a.x,q.a.y-p.a.y);
      if (distancia < 8 || distancia > 120) continue;
      const diferencia = Math.hypot(q.b.x-q.a.x-p.b.x+p.a.x,q.b.y-q.a.y-p.b.y+p.a.y);
      if (diferencia < 3 + distancia*0.08 && ++apoyo >= 2) return true;
    }
    return false;
  });
  const pares = respaldo ? apoyados : [...esquinas,...apoyados];
  // Un único detalle aislado no basta para contrastar un par de vistas.
  return pares;
}

function reducir(f: Trama): Trama {
  const ancho = Math.floor(f.ancho/2), alto = Math.floor(f.alto/2);
  const datos = new Uint8ClampedArray(ancho*alto*4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (2*y*f.ancho+2*x)*4;
      for (let c = 0; c < 3; c++) {
        const j = i+c, fila = 4*f.ancho;
        datos[4*(y*ancho+x)+c] = (f.datos[j]+f.datos[j+4]+f.datos[j+fila]+f.datos[j+fila+4])/4;
      }
    }
  }
  return { ancho, alto, datos };
}

self.onmessage = (e: MessageEvent<{ primera: Trama; segunda: Trama }>) => {
  const { primera, segunda } = e.data;
  const a = extraer(primera), b = extraer(segunda);
  let pares = emparejar(a,b);
  let escala = 1;
  if (pares.length < 3 && Math.min(primera.ancho, primera.alto) >= 72) {
    const alternativos = emparejar(extraer(reducir(primera),true), extraer(reducir(segunda),true), true);
    if (alternativos.length >= 3) {
      const ampliar = (p: Punto) => ({ x:2*p.x+0.5, y:2*p.y+0.5 });
      pares = alternativos.map(p => ({ a: ampliar(p.a), b: ampliar(p.b) }));
      escala = 2;
    }
  }
  self.postMessage({ pares: pares.length >= 3 ? pares : [], escala, candidatos: pares.length,
    detallesA: a.esquinas.length+a.manchas.length, detallesB: b.esquinas.length+b.manchas.length });
};
export {};
