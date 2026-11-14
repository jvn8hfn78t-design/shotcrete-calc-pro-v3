import type * as CV from "@techstark/opencv-js";
import {
  estimateRelativePose,
  IDENTITY_POSE,
  triangulateMatch,
  type Pose,
  type V2,
  type V3,
  type M3,
} from "./reconstruction-geometry";
import type {
  ReconstructionImage,
  ReconstructionPoint,
  ReconstructionProgress,
  ReconstructionResult,
} from "./reconstruction-types";

export type CvRuntime = typeof CV;
type Feature = { pixel: V2; normalized: V2 };
type Frame = {
  image: ReconstructionImage;
  focal: number;
  features: Feature[];
  descriptors: CV.Mat;
  tracks: Map<number, number>;
  pose?: Pose;
};
type Match = { a: number; b: number; distance: number };
type Track = { position: V3; color: [number, number, number]; errors: number[] };
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

function extract(cv: CvRuntime, image: ReconstructionImage): Frame {
  const source = cv.matFromArray(image.height, image.width, cv.CV_8UC4, image.rgba);
  const gray = new cv.Mat(),
    mask = new cv.Mat(),
    keypoints = new cv.KeyPointVector(),
    descriptors = new cv.Mat();
  const orb = new cv.ORB(3500, 1.2, 8, 24, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    orb.detectAndCompute(gray, mask, keypoints, descriptors);
    const focal = Math.max(image.width, image.height) * 0.9;
    const features: Feature[] = [];
    for (let i = 0; i < keypoints.size(); i++) {
      const point = keypoints.get(i).pt;
      features.push({
        pixel: [point.x, point.y],
        normalized: [(point.x - image.width / 2) / focal, (point.y - image.height / 2) / focal],
      });
    }
    return { image, focal, features, descriptors, tracks: new Map() };
  } catch (error) {
    descriptors.delete();
    throw error;
  } finally {
    source.delete();
    gray.delete();
    mask.delete();
    keypoints.delete();
    orb.delete();
  }
}

function matchFrames(cv: CvRuntime, a: Frame, b: Frame): Match[] {
  if (a.descriptors.rows < 2 || b.descriptors.rows < 2) return [];
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const forward = new cv.DMatchVectorVector(),
    backward = new cv.DMatchVectorVector();
  try {
    matcher.knnMatch(a.descriptors, b.descriptors, forward, 2);
    matcher.knnMatch(b.descriptors, a.descriptors, backward, 2);
    const reverse = new Map<number, number>();
    for (let i = 0; i < backward.size(); i++) {
      const row = backward.get(i);
      try {
        if (row.size() >= 2) {
          const best = row.get(0),
            next = row.get(1);
          if (best.distance < 0.78 * next.distance && best.distance < 65)
            reverse.set(best.queryIdx, best.trainIdx);
        }
      } finally {
        row.delete();
      }
    }
    const matches: Match[] = [];
    for (let i = 0; i < forward.size(); i++) {
      const row = forward.get(i);
      try {
        if (row.size() >= 2) {
          const best = row.get(0),
            next = row.get(1);
          if (
            best.distance < 0.78 * next.distance &&
            best.distance < 65 &&
            reverse.get(best.trainIdx) === best.queryIdx
          )
            matches.push({ a: best.queryIdx, b: best.trainIdx, distance: best.distance });
        }
      } finally {
        row.delete();
      }
    }
    return matches.sort((x, y) => x.distance - y.distance);
  } finally {
    forward.delete();
    backward.delete();
    matcher.delete();
  }
}

function planarFraction(cv: CvRuntime, a: Frame, b: Frame, matches: Match[]): number {
  const focal = Math.max(a.focal, b.focal);
  const first = cv.matFromArray(
    matches.length,
    1,
    cv.CV_32FC2,
    matches.flatMap((m) => a.features[m.a]!.normalized.map((v) => v * focal)),
  );
  const second = cv.matFromArray(
    matches.length,
    1,
    cv.CV_32FC2,
    matches.flatMap((m) => b.features[m.b]!.normalized.map((v) => v * focal)),
  );
  const mask = new cv.Mat();
  let homography: CV.Mat | undefined;
  try {
    homography = cv.findHomography(first, second, cv.RANSAC, 2, mask, 1500, 0.995);
    return Array.from(mask.data).filter((v) => v !== 0).length / matches.length;
  } finally {
    first.delete();
    second.delete();
    mask.delete();
    homography?.delete();
  }
}

function reprojection(position: V3, pose: Pose, point: V2, focal: number): number {
  const r = pose.rotation,
    t = pose.translation;
  const x = r[0] * position[0] + r[1] * position[1] + r[2] * position[2] + t[0];
  const y = r[3] * position[0] + r[4] * position[1] + r[5] * position[2] + t[1];
  const z = r[6] * position[0] + r[7] * position[1] + r[8] * position[2] + t[2];
  return z > 0 ? Math.hypot(x / z - point[0], y / z - point[1]) * focal : Infinity;
}
function colorAt(frame: Frame, index: number): [number, number, number] {
  const [x, y] = frame.features[index]!.pixel;
  const offset =
    (Math.min(frame.image.height - 1, Math.max(0, Math.round(y))) * frame.image.width +
      Math.min(frame.image.width - 1, Math.max(0, Math.round(x)))) *
    4;
  return [frame.image.rgba[offset]!, frame.image.rgba[offset + 1]!, frame.image.rgba[offset + 2]!];
}
function registerFrame(
  cv: CvRuntime,
  frame: Frame,
  correspondences: { feature: number; track: number }[],
  tracks: Track[],
): boolean {
  if (correspondences.length < 12) return false;
  const objects = cv.matFromArray(
    correspondences.length,
    1,
    cv.CV_64FC3,
    correspondences.flatMap((p) => tracks[p.track]!.position),
  );
  const pixels = cv.matFromArray(
    correspondences.length,
    1,
    cv.CV_64FC2,
    correspondences.flatMap((p) => frame.features[p.feature]!.normalized),
  );
  const camera = cv.Mat.eye(3, 3, cv.CV_64F),
    distortion = new cv.Mat(),
    rvec = new cv.Mat(),
    tvec = new cv.Mat(),
    inliers = new cv.Mat(),
    rotation = new cv.Mat();
  try {
    const success = cv.solvePnPRansac(
      objects,
      pixels,
      camera,
      distortion,
      rvec,
      tvec,
      false,
      300,
      3 / frame.focal,
      0.999,
      inliers,
      cv.SOLVEPNP_EPNP,
    );
    if (!success || inliers.rows < 10 || inliers.rows < correspondences.length * 0.35) return false;
    cv.Rodrigues(rvec, rotation);
    const pose: Pose = {
      rotation: Array.from(rotation.data64F) as M3,
      translation: Array.from(tvec.data64F) as V3,
    };
    if (![...pose.rotation, ...pose.translation].every(Number.isFinite)) return false;
    const accepted = correspondences.filter(
      (p) =>
        reprojection(
          tracks[p.track]!.position,
          pose,
          frame.features[p.feature]!.normalized,
          frame.focal,
        ) < 3,
    );
    if (accepted.length < 10) return false;
    frame.pose = pose;
    for (const p of accepted) {
      frame.tracks.set(p.feature, p.track);
      tracks[p.track]!.errors.push(
        reprojection(
          tracks[p.track]!.position,
          pose,
          frame.features[p.feature]!.normalized,
          frame.focal,
        ),
      );
    }
    return true;
  } finally {
    [objects, pixels, camera, distortion, rvec, tvec, inliers, rotation].forEach((mat) =>
      mat.delete(),
    );
  }
}

/** Sparse incremental SfM. Camera focal length is approximated; no metric scale or dense surface is inferred. */
export function reconstructImages(
  cv: CvRuntime,
  images: ReconstructionImage[],
  progress: (value: ReconstructionProgress) => void,
): ReconstructionResult {
  const started = performance.now(),
    frames: Frame[] = [],
    tracks: Track[] = [];
  const pairs = new Map<string, Match[]>();
  const matches = (a: number, b: number) => {
    const key = `${a}:${b}`;
    let value = pairs.get(key);
    if (!value) {
      value = matchFrames(cv, frames[a]!, frames[b]!);
      pairs.set(key, value);
    }
    return value;
  };
  try {
    for (const [i, image] of images.entries()) {
      progress({
        percent: 15 + Math.round((i / images.length) * 23),
        message: `Buscando detalles en fotografía ${i + 1} de ${images.length}…`,
      });
      frames.push(extract(cv, image));
    }
    if (frames.filter((f) => f.features.length >= 100).length < 2)
      throw new Error(
        "No hay suficientes detalles visibles. Usa fotografías nítidas, con buena luz y textura; evita superficies lisas.",
      );
    let initialized = false;
    let attempted = 0;
    // Adjacent frames retain overlap; a second step accommodates very small baselines.
    for (let gap = 1; gap <= Math.min(3, frames.length - 1) && !initialized; gap++)
      for (let a = 0; a + gap < frames.length && !initialized; a++) {
        const b = a + gap,
          first = frames[a]!,
          second = frames[b]!;
        const pair = matches(a, b);
        progress({
          percent: 40 + Math.min(15, attempted++),
          message: `Relacionando fotografías ${a + 1} y ${b + 1}…`,
        });
        if (pair.length < 35 || planarFraction(cv, first, second, pair) > 0.88) continue;
        const relative = estimateRelativePose(
          pair.map((m) => ({
            a: first.features[m.a]!.normalized,
            b: second.features[m.b]!.normalized,
          })),
          Math.max(first.focal, second.focal),
        );
        if (!relative) continue;
        first.pose = IDENTITY_POSE;
        second.pose = relative.pose;
        for (const point of relative.points) {
          const match = pair[point.index]!;
          const id = tracks.length;
          tracks.push({
            position: point.position,
            color: colorAt(first, match.a),
            errors: [point.error],
          });
          first.tracks.set(match.a, id);
          second.tracks.set(match.b, id);
        }
        initialized = true;
      }
    if (!initialized)
      throw new Error(
        "No se pudo recuperar profundidad fiable. Muévete lateralmente entre fotos, conserva un 60–80 % de solape y evita fotos repetidas, borrosas o tomadas girando desde un mismo punto.",
      );
    // Two passes allow an initially difficult image to register once more points exist.
    for (let pass = 0; pass < 2; pass++)
      for (let index = 0; index < frames.length; index++) {
        const frame = frames[index]!;
        if (frame.pose) continue;
        progress({
          percent: 58 + Math.round(((pass * frames.length + index) / (frames.length * 2)) * 32),
          message: `Integrando fotografía ${index + 1} de ${frames.length}…`,
        });
        const neighbors = frames
          .map((f, i) => ({ f, i }))
          .filter((v) => v.f.pose)
          .sort((a, b) => Math.abs(a.i - index) - Math.abs(b.i - index))
          .slice(0, 4);
        const links = new Map<number, { feature: number; track: number; distance: number }>();
        const usedTracks = new Set<number>();
        for (const { f, i } of neighbors)
          for (const m of matches(i, index)) {
            const track = f.tracks.get(m.a);
            if (track === undefined) continue;
            const old = links.get(m.b);
            if (!old || m.distance < old.distance)
              links.set(m.b, { feature: m.b, track, distance: m.distance });
          }
        const correspondences = Array.from(links.values())
          .sort((a, b) => a.distance - b.distance)
          .filter((link) => {
            if (usedTracks.has(link.track)) return false;
            usedTracks.add(link.track);
            return true;
          });
        if (!registerFrame(cv, frame, correspondences, tracks) || !frame.pose) continue;
        for (const { f, i } of neighbors)
          for (const m of matches(i, index)) {
            if (frame.tracks.has(m.b)) continue;
            const known = f.tracks.get(m.a);
            if (known !== undefined) {
              const error = reprojection(
                tracks[known]!.position,
                frame.pose,
                frame.features[m.b]!.normalized,
                frame.focal,
              );
              if (error < 2.5) {
                frame.tracks.set(m.b, known);
                tracks[known]!.errors.push(error);
              }
              continue;
            }
            if (tracks.length >= 12000) continue;
            const point = triangulateMatch(
              f.features[m.a]!.normalized,
              frame.features[m.b]!.normalized,
              f.pose!,
              frame.pose,
              Math.max(f.focal, frame.focal),
            );
            if (!point) continue;
            const id = tracks.length;
            tracks.push({
              position: point.position,
              color: colorAt(f, m.a),
              errors: [point.error],
            });
            f.tracks.set(m.a, id);
            frame.tracks.set(m.b, id);
          }
      }
    const registeredViews = frames.filter((f) => f.pose).length;
    const center: V3 = [0, 1, 2].map((axis) => median(tracks.map((t) => t.position[axis]!))) as V3;
    const radii = tracks.map((t) => Math.hypot(...t.position.map((v, i) => v - center[i]!)));
    const radius = median(radii);
    const valid = tracks.filter((t, i) => radii[i]! <= radius * 8 && median(t.errors) < 2.5);
    if (valid.length < 30)
      throw new Error(
        "La reconstrucción produjo muy pocos puntos estables. Repite las fotos con más textura, luz y solape.",
      );
    const warnings = [
      "Escala relativa: estas coordenadas no representan metros ni volúmenes.",
      "Cámara aproximada, sin calibración ni ajuste global: puede haber deformaciones. No usar para cubicación ni decisiones de sostenimiento.",
    ];
    if (registeredViews < images.length)
      warnings.push(
        `Se pudieron integrar ${registeredViews} de ${images.length} fotografías; la cobertura es parcial.`,
      );
    if (valid.length < 200)
      warnings.push(
        "Nube poco densa. Añade imágenes con más textura y solape para mejorar la cobertura.",
      );
    const points: ReconstructionPoint[] = valid.map(({ position: p, color: c }) => ({
      x: p[0],
      y: p[1],
      z: p[2],
      r: c[0],
      g: c[1],
      b: c[2],
    }));
    progress({ percent: 100, message: "Reconstrucción de puntos completada." });
    return {
      points,
      cameras: frames.flatMap((frame, imageIndex) =>
        frame.pose ? [{ imageIndex, focal: frame.focal, pose: frame.pose }] : [],
      ),
      registeredViews,
      totalViews: images.length,
      reprojectionError: median(valid.flatMap((t) => t.errors)),
      elapsedMs: performance.now() - started,
      warnings,
      engine: "OpenCV.js + SfM",
      scale: "relative",
    };
  } finally {
    frames.forEach((frame) => frame.descriptors.delete());
  }
}
