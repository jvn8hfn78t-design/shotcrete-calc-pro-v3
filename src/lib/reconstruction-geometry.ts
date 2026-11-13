import { EigenvalueDecomposition, Matrix, SingularValueDecomposition } from "ml-matrix";

/** Row-major rotations, with camera coordinates = R * world + t. */
export type V3 = [number, number, number];
export type M3 = [number, number, number, number, number, number, number, number, number];
export type V2 = [number, number];
export type Correspondence = { a: V2; b: V2 };
export type Pose = { rotation: M3; translation: V3 };
export type TriangulatedPoint = { position: V3; error: number; parallax: number };
export type RelativePoseResult = {
  pose: Pose;
  inliers: number[];
  points: (TriangulatedPoint & { index: number })[];
};

export const IDENTITY_POSE: Pose = {
  rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  translation: [0, 0, 0],
};
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a: V3): V3 => scale(a, 1 / Math.hypot(...a));
const transpose = (r: M3): M3 => [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];
const rotate = (r: M3, p: V3): V3 => [
  r[0] * p[0] + r[1] * p[1] + r[2] * p[2],
  r[3] * p[0] + r[4] * p[1] + r[5] * p[2],
  r[6] * p[0] + r[7] * p[1] + r[8] * p[2],
];
const matrix3 = (r: M3) => new Matrix([r.slice(0, 3), r.slice(3, 6), r.slice(6, 9)]);
const flat3 = (m: Matrix): M3 => m.to1DArray() as M3;
const determinant = (m: Matrix) =>
  m.get(0, 0) * (m.get(1, 1) * m.get(2, 2) - m.get(1, 2) * m.get(2, 1)) -
  m.get(0, 1) * (m.get(1, 0) * m.get(2, 2) - m.get(1, 2) * m.get(2, 0)) +
  m.get(0, 2) * (m.get(1, 0) * m.get(2, 1) - m.get(1, 1) * m.get(2, 0));

/** Triangulation by closest calibrated rays. Error is the larger reprojection error in pixels. */
export function triangulateMatch(
  a: V2,
  b: V2,
  poseA: Pose,
  poseB: Pose,
  focalPixel: number,
): TriangulatedPoint | null {
  const at = transpose(poseA.rotation),
    bt = transpose(poseB.rotation);
  const centerA = scale(rotate(at, poseA.translation), -1);
  const centerB = scale(rotate(bt, poseB.translation), -1);
  const directionA = unit(rotate(at, [a[0], a[1], 1]));
  const directionB = unit(rotate(bt, [b[0], b[1], 1]));
  const cosine = Math.max(-1, Math.min(1, dot(directionA, directionB)));
  const denominator = 1 - cosine * cosine;
  if (denominator < 1e-8) return null;
  const parallax = (Math.acos(cosine) * 180) / Math.PI;
  if (parallax < 1 || parallax > 90) return null;
  const baseline = sub(centerB, centerA);
  const v1 = dot(baseline, directionA),
    v2 = dot(baseline, directionB);
  const distanceA = (v1 - cosine * v2) / denominator;
  const distanceB = (cosine * v1 - v2) / denominator;
  if (!(distanceA > 0 && distanceB > 0)) return null;
  const position = scale(
    add(add(centerA, scale(directionA, distanceA)), add(centerB, scale(directionB, distanceB))),
    0.5,
  );
  const projectedA = add(rotate(poseA.rotation, position), poseA.translation);
  const projectedB = add(rotate(poseB.rotation, position), poseB.translation);
  if (projectedA[2] <= 1e-8 || projectedB[2] <= 1e-8) return null;
  const error =
    Math.max(
      Math.hypot(projectedA[0] / projectedA[2] - a[0], projectedA[1] / projectedA[2] - a[1]),
      Math.hypot(projectedB[0] / projectedB[2] - b[0], projectedB[1] / projectedB[2] - b[1]),
    ) * focalPixel;
  if (!position.every(Number.isFinite) || !Number.isFinite(error) || error > 2.5) return null;
  return { position, error, parallax };
}

function normalizer(points: V2[]) {
  const center: V2 = [0, 0];
  for (const p of points) {
    center[0] += p[0];
    center[1] += p[1];
  }
  center[0] /= points.length;
  center[1] /= points.length;
  let distance = 0;
  for (const p of points) distance += Math.hypot(p[0] - center[0], p[1] - center[1]);
  const factor = Math.SQRT2 / Math.max(distance / points.length, 1e-9);
  return {
    matrix: new Matrix([
      [factor, 0, -factor * center[0]],
      [0, factor, -factor * center[1]],
      [0, 0, 1],
    ]),
    points: points.map((p) => [(p[0] - center[0]) * factor, (p[1] - center[1]) * factor] as V2),
  };
}

/** Hartley-normalized eight-point fit. Enforce rank two during RANSAC; equal singular values only on the final inlier refit. */
function fitEssential(matches: Correspondence[], enforceEssential = false): M3 | null {
  if (matches.length < 8) return null;
  const left = normalizer(matches.map((m) => m.a)),
    right = normalizer(matches.map((m) => m.b));
  const ata = Matrix.zeros(9, 9);
  for (let k = 0; k < matches.length; k++) {
    const [x, y] = left.points[k]!,
      [u, v] = right.points[k]!;
    const row = [u * x, u * y, u, v * x, v * y, v, x, y, 1];
    for (let i = 0; i < 9; i++)
      for (let j = i; j < 9; j++) ata.set(i, j, ata.get(i, j) + row[i]! * row[j]!);
  }
  for (let i = 0; i < 9; i++) for (let j = 0; j < i; j++) ata.set(i, j, ata.get(j, i));
  try {
    const eig = new EigenvalueDecomposition(ata, { assumeSymmetric: true });
    const eigenvalues = eig.realEigenvalues;
    const order = eigenvalues
      .map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value);
    if (order[1]!.value < 1e-8) return null; // insufficient independent constraints
    const vector = eig.eigenvectorMatrix.getColumn(order[0]!.index);
    const raw = right.matrix
      .transpose()
      .mmul(matrix3(vector as M3))
      .mmul(left.matrix);
    const svd = new SingularValueDecomposition(raw);
    const u = svd.leftSingularVectors,
      v = svd.rightSingularVectors;
    if (svd.diagonal[1]! < 1e-9) return null;
    const diagonal = enforceEssential ? [1, 1, 0] : [svd.diagonal[0]!, svd.diagonal[1]!, 0];
    return flat3(u.mmul(Matrix.diag(diagonal)).mmul(v.transpose()));
  } catch {
    return null;
  }
}

function sampsonSquared(e: M3, match: Correspondence): number {
  const a: V3 = [match.a[0], match.a[1], 1],
    b: V3 = [match.b[0], match.b[1], 1];
  const ea = rotate(e, a),
    etb = rotate(transpose(e), b);
  const residual = dot(b, ea);
  return (
    (residual * residual) /
    Math.max(1e-16, ea[0] * ea[0] + ea[1] * ea[1] + etb[0] * etb[0] + etb[1] * etb[1])
  );
}

function posesFromEssential(e: M3): Pose[] {
  const svd = new SingularValueDecomposition(matrix3(e));
  const u = svd.leftSingularVectors,
    v = svd.rightSingularVectors;
  // Singular vectors are sign ambiguous. Keep both bases right-handed.
  if (determinant(u) < 0) for (let i = 0; i < 3; i++) u.set(i, 2, -u.get(i, 2));
  if (determinant(v) < 0) for (let i = 0; i < 3; i++) v.set(i, 2, -v.get(i, 2));
  const w = new Matrix([
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ]);
  const t: V3 = [u.get(0, 2), u.get(1, 2), u.get(2, 2)];
  const rotations = [
    flat3(u.mmul(w).mmul(v.transpose())),
    flat3(u.mmul(w.transpose()).mmul(v.transpose())),
  ];
  return rotations.flatMap((rotation) => [
    { rotation, translation: t },
    { rotation, translation: scale(t, -1) },
  ]);
}

/** Coordinates must already be centered and divided by each image's focal length. */
export function estimateRelativePose(
  matches: Correspondence[],
  focalPixel: number,
): RelativePoseResult | null {
  if (
    matches.length < 30 ||
    !(focalPixel > 0) ||
    matches.some((m) => ![...m.a, ...m.b].every(Number.isFinite))
  )
    return null;
  let seed = 0x53f172b9;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let best: number[] = [],
    bestError = Infinity,
    iterations = 1200;
  const threshold = (1.5 / focalPixel) ** 2;
  const score = (e: M3) => {
    const indices: number[] = [];
    let error = 0;
    for (let i = 0; i < matches.length; i++) {
      const distance = sampsonSquared(e, matches[i]!);
      if (distance < threshold) {
        indices.push(i);
        error += distance;
      }
    }
    return { indices, error };
  };
  for (let iteration = 0; iteration < iterations; iteration++) {
    const picked = new Set<number>();
    while (picked.size < 8) picked.add(Math.floor(random() * matches.length));
    const e = fitEssential(Array.from(picked, (i) => matches[i]!));
    if (!e) continue;
    const { indices, error } = score(e);
    if (indices.length > best.length || (indices.length === best.length && error < bestError)) {
      best = indices;
      bestError = error;
      const success = (best.length / matches.length) ** 8;
      if (success > 0 && success < 1)
        iterations = Math.min(
          iterations,
          Math.max(100, Math.ceil(Math.log(0.001) / Math.log(1 - success))),
        );
    }
  }
  if (best.length < 30 || best.length < matches.length * 0.35) return null;
  let e = fitEssential(best.map((i) => matches[i]!));
  if (!e) return null;
  // Refit using all geometrically consistent matches, rather than the random minimal sample.
  for (let step = 0; step < 2; step++) {
    const indices = score(e).indices;
    if (indices.length < 30) break;
    const refined = fitEssential(indices.map((i) => matches[i]!));
    if (!refined) break;
    best = indices;
    e = refined;
  }
  best = score(e).indices;
  e = fitEssential(
    best.map((i) => matches[i]!),
    true,
  );
  if (!e) return null;
  let result: RelativePoseResult | null = null;
  for (const pose of posesFromEssential(e)) {
    const points: RelativePoseResult["points"] = [];
    for (const index of best) {
      const match = matches[index]!;
      const point = triangulateMatch(match.a, match.b, IDENTITY_POSE, pose, focalPixel);
      if (point) points.push({ ...point, index });
    }
    if (!result || points.length > result.points.length) result = { pose, inliers: best, points };
  }
  if (!result || result.points.length < 30 || result.points.length < best.length * 0.6) return null;
  const parallax = result.points.map((p) => p.parallax).sort((a, b) => a - b);
  if (parallax[Math.floor(parallax.length / 2)]! < 1.2) return null;
  return result;
}
