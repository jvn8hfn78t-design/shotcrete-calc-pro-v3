import type { Pose, V3 } from "./reconstruction-geometry";
import type { ReconstructionImage, ReconstructionPoint } from "./reconstruction-types";
export type DenseCamera = { imageIndex: number; focal: number; pose: Pose };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V3): V3 => {
  const n = Math.hypot(...a);
  return a.map((x) => x / n) as V3;
};
const center = (p: Pose): V3 =>
  [0, 1, 2].map(
    (i) =>
      -p.rotation[i]! * p.translation[0] -
      p.rotation[i + 3]! * p.translation[1] -
      p.rotation[i + 6]! * p.translation[2],
  ) as V3;
const axis = (p: Pose): V3 => p.rotation.slice(6, 9) as V3;
const quantile = (v: number[], q: number) => v[Math.min(v.length - 1, Math.floor(v.length * q))]!;
function popcount(v: number) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Streaming Census block stereo: estimates disparity per image region; never fills missing depths. */
export function matchRectified(
  left: Uint8Array,
  right: Uint8Array,
  maskL: Uint8Array,
  maskR: Uint8Array,
  width: number,
  height: number,
  minD: number,
  maxD: number,
) {
  const n = width * height,
    cl = new Uint32Array(n),
    cr = new Uint32Array(n),
    texture = new Uint8Array(n);
  const validL = new Uint8Array(n),
    validR = new Uint8Array(n);
  for (let y = 3; y < height - 3; y++)
    for (let x = 3; x < width - 3; x++) {
      const k = y * width + x;
      let a = 0,
        b = 0,
        lo = 255,
        hi = 0,
        vl = 1,
        vr = 1;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue;
          const j = k + dy * width + dx;
          a = (a << 1) | (left[j]! < left[k]! ? 1 : 0);
          b = (b << 1) | (right[j]! < right[k]! ? 1 : 0);
          lo = Math.min(lo, left[j]!);
          hi = Math.max(hi, left[j]!);
          vl &= maskL[j]!;
          vr &= maskR[j]!;
        }
      cl[k] = a;
      cr[k] = b;
      texture[k] = hi - lo;
      validL[k] = vl & maskL[k]!;
      validR[k] = vr & maskR[k]!;
    }
  const bestL = new Float32Array(n).fill(1e6),
    second = new Float32Array(n).fill(1e6),
    bestR = new Float32Array(n).fill(1e6);
  const dl = new Int16Array(n),
    dr = new Int16Array(n),
    cost = new Float32Array(n),
    horizontal = new Float32Array(n);
  for (let d = minD; d <= maxD; d++) {
    cost.fill(100);
    horizontal.fill(900);
    for (let y = 3; y < height - 3; y++)
      for (let x = d + 3; x < width - 3; x++) {
        const k = y * width + x;
        if (validL[k] && validR[k - d]) cost[k] = popcount(cl[k]! ^ cr[k - d]!);
      }
    for (let y = 3; y < height - 3; y++)
      for (let x = d + 4; x < width - 4; x++) {
        const k = y * width + x;
        horizontal[k] = cost[k - 1]! + cost[k]! + cost[k + 1]!;
      }
    for (let y = 4; y < height - 4; y++)
      for (let x = d + 4; x < width - 4; x++) {
        const k = y * width + x,
          c = horizontal[k - width]! + horizontal[k]! + horizontal[k + width]!;
        if (c < bestL[k]!) {
          if (Math.abs(d - dl[k]!) > 2) second[k] = bestL[k]!;
          bestL[k] = c;
          dl[k] = d;
        } else if (Math.abs(d - dl[k]!) > 2 && c < second[k]!) second[k] = c;
        if (c < bestR[k - d]!) {
          bestR[k - d] = c;
          dr[k - d] = d;
        }
      }
  }
  const disparity = new Float32Array(n);
  let candidates = 0,
    accepted = 0;
  for (let y = 5; y < height - 5; y++)
    for (let x = minD + 5; x < width - 5; x++) {
      const k = y * width + x,
        d = dl[k]!;
      if (!validL[k] || texture[k]! < 18) continue;
      candidates++;
      if (
        d <= minD ||
        d >= maxD ||
        bestL[k]! > 65 ||
        second[k]! < bestL[k]! * 1.15 + 3 ||
        Math.abs(dr[k - d]! - d) > 1
      )
        continue;
      let sa = 0,
        sb = 0,
        saa = 0,
        sbb = 0,
        sab = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const a = left[k + dy * width + dx]!,
            b = right[k + dy * width + dx - d]!;
          sa += a;
          sb += b;
          saa += a * a;
          sbb += b * b;
          sab += a * b;
        }
      const correlation =
        (sab - (sa * sb) / 25) /
        Math.sqrt(Math.max(1, (saa - (sa * sa) / 25) * (sbb - (sb * sb) / 25)));
      if (correlation < 0.8) continue;
      disparity[k] = d;
      accepted++;
    }
  return { disparity, candidates, accepted };
}

function rectify(
  image: ReconstructionImage,
  camera: DenseCamera,
  axes: [V3, V3, V3],
  width: number,
  height: number,
  focal: number,
) {
  const gray = new Uint8Array(width * height),
    mask = new Uint8Array(width * height),
    colors = new Uint8Array(width * height * 3);
  const r = camera.pose.rotation;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = (x - width / 2) / focal,
        v = (y - height / 2) / focal;
      const ray = axes[0].map((_, i) => axes[0][i]! * u + axes[1][i]! * v + axes[2][i]!) as V3;
      const z = r[6] * ray[0] + r[7] * ray[1] + r[8] * ray[2];
      if (z <= 0) continue;
      const px =
        (camera.focal * (r[0] * ray[0] + r[1] * ray[1] + r[2] * ray[2])) / z + image.width / 2;
      const py =
        (camera.focal * (r[3] * ray[0] + r[4] * ray[1] + r[5] * ray[2])) / z + image.height / 2;
      if (px < 1 || py < 1 || px >= image.width - 2 || py >= image.height - 2) continue;
      const ix = Math.floor(px),
        iy = Math.floor(py),
        dx = px - ix,
        dy = py - iy,
        k = y * width + x;
      const indices = [
        iy * image.width + ix,
        iy * image.width + ix + 1,
        (iy + 1) * image.width + ix,
        (iy + 1) * image.width + ix + 1,
      ];
      const weights = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
      for (let ch = 0; ch < 3; ch++)
        colors[k * 3 + ch] = Math.round(
          indices.reduce((s, index, i) => s + image.rgba[index * 4 + ch]! * weights[i]!, 0),
        );
      gray[k] = Math.round(
        colors[k * 3]! * 0.299 + colors[k * 3 + 1]! * 0.587 + colors[k * 3 + 2]! * 0.114,
      );
      mask[k] = 1;
    }
  return { gray, mask, colors };
}

/** Pairwise dense depth + voxel fusion in the shared SfM coordinate system. */
export function densify(
  images: ReconstructionImage[],
  cameras: DenseCamera[],
  sparse: ReconstructionPoint[],
  progress: (p: number, message: string) => void,
) {
  if (sparse.length < 30 || cameras.length < 2)
    throw new Error("No hay suficientes cámaras o puntos iniciales para estimar profundidad.");
  const pairs: { a: DenseCamera; b: DenseCamera; baseline: number }[] = [];
  for (let i = 0; i < cameras.length; i++)
    for (let j = i + 1; j < Math.min(cameras.length, i + 3); j++) {
      const a = cameras[i]!,
        b = cameras[j]!,
        baseline = Math.hypot(...sub(center(b.pose), center(a.pose)));
      if (baseline > 1e-5 && dot(axis(a.pose), axis(b.pose)) > 0.65) pairs.push({ a, b, baseline });
    }
  const fused = new Map<string, { p: ReconstructionPoint; n: number }>();
  let candidates = 0,
    accepted = 0,
    processed = 0;
  const stats: { images: number[]; accepted: number; candidates: number }[] = [];
  const distances = sparse.map((p) => Math.hypot(p.x, p.y, p.z)).sort((a, b) => a - b);
  const voxel = Math.max(quantile(distances, 0.5) * 0.0015, 1e-6);
  for (const [index, { a, b, baseline }] of pairs.entries()) {
    progress(
      index / pairs.length,
      `Profundidad de fotos ${a.imageIndex + 1} y ${b.imageIndex + 1}…`,
    );
    const ca = center(a.pose),
      cb = center(b.pose),
      ex = unit(sub(cb, ca));
    const az = axis(a.pose),
      bz = axis(b.pose),
      average = unit(az.map((v, i) => v + bz[i]!) as V3);
    if (Math.abs(dot(ex, average)) > 0.85) continue;
    const ey = unit(cross(average, ex)),
      ez = unit(cross(ex, ey));
    const axes: [V3, V3, V3] = [ex, ey, ez];
    const depths = sparse
      .map((p) => dot(sub([p.x, p.y, p.z], ca), ez))
      .filter((z) => z > 0)
      .sort((x, y) => x - y);
    if (depths.length < 30) continue;
    const width = 640,
      height = Math.round((width * images[a.imageIndex]!.height) / images[a.imageIndex]!.width),
      focal = width * 0.9;
    if (height > 960) continue;
    const minD = Math.max(1, Math.floor((focal * baseline) / (quantile(depths, 0.97) * 1.5)));
    const maxD = Math.min(
      192,
      Math.ceil((focal * baseline) / (quantile(depths, 0.03) * 0.65)),
      width / 3,
    );
    if (maxD - minD < 8) continue;
    const left = rectify(images[a.imageIndex]!, a, axes, width, height, focal),
      right = rectify(images[b.imageIndex]!, b, axes, width, height, focal);
    const map = matchRectified(
      left.gray,
      right.gray,
      left.mask,
      right.mask,
      width,
      height,
      minD,
      Math.floor(maxD),
    );
    candidates += map.candidates;
    accepted += map.accepted;
    processed++;
    stats.push({
      images: [a.imageIndex, b.imageIndex],
      accepted: map.accepted,
      candidates: map.candidates,
    });
    for (let y = 5; y < height - 5; y++)
      for (let x = 5; x < width - 5; x++) {
        const k = y * width + x,
          d = map.disparity[k]!;
        if (!d) continue;
        // Reject isolated depth spikes rather than joining them to neighboring walls.
        let neighbors = 0;
        for (const offset of [-1, 1, -width, width])
          if (Math.abs(map.disparity[k + offset]! - d) <= 2 && map.disparity[k + offset])
            neighbors++;
        if (neighbors < 3) continue;
        const z = (focal * baseline) / d,
          u = ((x - width / 2) * z) / focal,
          v = ((y - height / 2) * z) / focal;
        const world = ca.map((value, i) => value + ex[i]! * u + ey[i]! * v + ez[i]! * z);
        const p = {
          x: world[0]!,
          y: world[1]!,
          z: world[2]!,
          r: left.colors[k * 3]!,
          g: left.colors[k * 3 + 1]!,
          b: left.colors[k * 3 + 2]!,
        };
        const key = world.map((value) => Math.floor(value / voxel)).join(":");
        const existing = fused.get(key);
        if (existing) {
          const n = ++existing.n;
          for (const ch of ["x", "y", "z", "r", "g", "b"] as const)
            existing.p[ch] += (p[ch] - existing.p[ch]) / n;
        } else if (fused.size < 350000) fused.set(key, { p, n: 1 });
      }
  }
  const points = Array.from(fused.values(), ({ p }) => ({
    ...p,
    r: Math.round(p.r),
    g: Math.round(p.g),
    b: Math.round(p.b),
  }));
  if (points.length < Math.max(1000, sparse.length * 2))
    throw new Error(
      "La profundidad no tiene suficiente apoyo para una nube densa. Prueba el motor de puntos iniciales o repite las fotos con más textura, luz y desplazamiento lateral.",
    );
  return {
    points,
    statistics: {
      pairs: processed,
      candidates,
      accepted,
      voxelSize: voxel,
      perPair: stats,
      pointLimitReached: fused.size >= 350000,
    },
  };
}
