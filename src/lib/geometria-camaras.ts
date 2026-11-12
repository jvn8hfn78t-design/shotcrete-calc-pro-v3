type Punto = { x:number; y:number };
type Par = { a:Punto; b:Punto };
type Vector = [number,number,number];
type Estado = "escasos" | "incierto" | "plano" | "paralaje";

export type Diagnostico = { estado:Estado; plano:number; fuera:number; apoyo:number };

function cruz(a:Vector,b:Vector):Vector {
  return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
}

// Coordenadas de trabajo en unidades de 512 píxeles para acondicionar el ajuste.
function homografia(muestra:Par[]) {
  const m=Array.from({length:8},()=>new Float64Array(9));
  function acumular(f:number[],destino:number) {
    for(let i=0;i<8;i++) {
      for(let j=0;j<8;j++) m[i][j]+=f[i]*f[j];
      m[i][8]+=f[i]*destino;
    }
  }
  for(const {a,b} of muestra) {
    const x=a.x/512,y=a.y/512,u=b.x/512,v=b.y/512;
    acumular([x,y,1,0,0,0,-u*x,-u*y],u);
    acumular([0,0,0,x,y,1,-v*x,-v*y],v);
  }
  for(let j=0;j<8;j++) {
    let pivote=j;
    for(let i=j+1;i<8;i++) if(Math.abs(m[i][j])>Math.abs(m[pivote][j])) pivote=i;
    if(Math.abs(m[pivote][j])<1e-10) return null;
    [m[j],m[pivote]]=[m[pivote],m[j]];
    const divisor=m[j][j];
    for(let k=j;k<=8;k++) m[j][k]/=divisor;
    for(let i=0;i<8;i++) {
      if(i===j) continue;
      const factor=m[i][j];
      for(let k=j;k<=8;k++) m[i][k]-=factor*m[j][k];
    }
  }
  return m.map(f=>f[8]);
}

function proyectar(h:number[],a:Punto):Punto {
  const x=a.x/512,y=a.y/512,w=h[6]*x+h[7]*y+1;
  return {x:512*(h[0]*x+h[1]*y+h[2])/w,y:512*(h[3]*x+h[4]*y+h[5])/w};
}
const distancia=(a:Punto,b:Punto)=>Math.hypot(a.x-b.x,a.y-b.y);

export function evaluarCamaras(pares:Par[]):Diagnostico {
  const d:Diagnostico={estado:"escasos",plano:0,fuera:0,apoyo:0};
  if(pares.length<12) return d;
  d.estado="incierto";
  let mejor:number[]|null=null, dentro:Par[]=[], error=Infinity, semilla=31817;
  for(let t=0;t<100;t++) {
    const ids=new Set<number>();
    while(ids.size<4) {
      semilla=(Math.imul(semilla,1664525)+1013904223)>>>0;
      ids.add(Math.floor(semilla/4294967296*pares.length));
    }
    const h=homografia(Array.from(ids,i=>pares[i]));
    if(!h) continue;
    const grupo:Par[]=[]; let suma=0;
    for(const p of pares) {
      const e=distancia(proyectar(h,p.a),p.b);
      if(e<=2.5) {grupo.push(p); suma+=e*e;}
    }
    if(grupo.length>dentro.length || (grupo.length===dentro.length && suma<error)) {
      mejor=h; dentro=grupo; error=suma;
    }
  }
  if(!mejor || dentro.length<Math.max(8,pares.length*0.35)) return d;
  const h=homografia(dentro) ?? mejor;
  const externos:{p:Par; previsto:Punto; linea:Vector}[]=[];
  for(const p of pares) {
    const q=proyectar(h,p.a),e=distancia(q,p.b);
    if(e<=2.5) d.plano++;
    if(Number.isFinite(e) && e>=5) {
      externos.push({p,previsto:q,linea:cruz([q.x,q.y,1],[p.b.x,p.b.y,1])});
    }
  }
  d.fuera=externos.length;
  if(d.plano<Math.max(8,pares.length*0.35)) return d;
  // En dos vistas, las rectas entre H*a y b pasan por el epipolo.
  // La representación homogénea también admite un epipolo en el infinito.
  const salto=Math.max(1,Math.ceil(externos.length/40));
  for(let i=0;i<externos.length;i+=salto) for(let j=i+1;j<externos.length;j+=salto) {
    if(distancia(externos[i].p.b,externos[j].p.b)<16) continue;
    const epipolo=cruz(externos[i].linea,externos[j].linea);
    let apoyo=0;
    const celdas=new Set<string>();
    for(const {p,previsto:q} of externos) {
      const [a,b,c]=cruz(epipolo,[q.x,q.y,1]);
      const norma=Math.hypot(a,b);
      if(norma>1e-8 && Math.abs(a*p.b.x+b*p.b.y+c)/norma<=1.25) {
        apoyo++; celdas.add(Math.floor(p.b.x/40)+","+Math.floor(p.b.y/40));
      }
    }
    if(celdas.size>=3) d.apoyo=Math.max(d.apoyo,apoyo);
  }
  if(d.apoyo>=Math.max(8,Math.ceil(0.70*d.fuera))) d.estado="paralaje";
  else if(d.plano>=0.85*pares.length) d.estado="plano";
  return d;
}
