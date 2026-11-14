import assert from "node:assert/strict";
import {
  estimateRelativePose,
  triangulateMatch,
  IDENTITY_POSE,
} from "../src/lib/reconstruction-geometry.ts";
let seed = 152713;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const focal = 900;
const angle = 0.07,
  c = Math.cos(angle),
  s = Math.sin(angle);
const R = [c, 0, s, 0, 1, 0, -s, 0, c];
const norm = (v) => Math.hypot(...v),
  unit = (v) => v.map((x) => x / norm(v));
const t = unit([-0.9, 0.04, 0.12]);
const rotate = (r, p) => [
  r[0] * p[0] + r[1] * p[1] + r[2] * p[2],
  r[3] * p[0] + r[4] * p[1] + r[5] * p[2],
  r[6] * p[0] + r[7] * p[1] + r[8] * p[2],
];
const project = (p, r, t) => {
  const q = rotate(r, p).map((v, i) => v + t[i]);
  return [q[0] / q[2], q[1] / q[2]];
};
const points = Array.from({ length: 200 }, () => [
  (random() - 0.5) * 5,
  (random() - 0.5) * 3,
  4 + random() * 7,
]);
function correspondences({ translation = t, noise = 0, outliers = 0 } = {}) {
  return points.map((p, i) => {
    const a = project(p, IDENTITY_POSE.rotation, [0, 0, 0]),
      b = project(p, R, translation);
    const perturb = (v) => v + ((random() - 0.5) * noise * 2) / focal;
    return {
      a: a.map(perturb),
      b: i < outliers ? [(random() - 0.5) * 0.8, (random() - 0.5) * 0.8] : b.map(perturb),
    };
  });
}
for (const [name, options] of [
  ["exact", {}],
  ["noisy20percent", { noise: 0.25, outliers: 40 }],
  ["noisy30percent", { noise: 0.5, outliers: 60 }],
]) {
  const start = performance.now();
  const result = estimateRelativePose(correspondences(options), focal);
  assert.ok(result, `${name} reconstruction must succeed`);
  const rotationError = Math.max(...R.map((v, i) => Math.abs(v - result.pose.rotation[i])));
  const alignment = t.reduce((sum, v, i) => sum + v * result.pose.translation[i], 0);
  console.log(
    name,
    JSON.stringify({
      points: result.points.length,
      inliers: result.inliers.length,
      rotationError,
      translationAlignment: alignment,
      medianError: result.points.map((p) => p.error).sort((a, b) => a - b)[
        Math.floor(result.points.length / 2)
      ],
      ms: Math.round(performance.now() - start),
    }),
  );
  assert.ok(rotationError < 0.03, `${name} rotation accurate`);
  assert.ok(alignment > 0.99, `${name} translation aligned`);
  if (name === "exact") {
    const errors = result.points.map((q) =>
      Math.hypot(...q.position.map((v, j) => v - points[q.index][j])),
    );
    assert.ok(Math.max(...errors) < 1e-5);
  }
}
for (const [name, translation] of [
  ["pure rotation", [0, 0, 0]],
  ["near zero baseline", [1e-5, 0, 0]],
]) {
  const result = estimateRelativePose(correspondences({ translation, noise: 0.1 }), focal);
  assert.equal(result, null, `${name} must reject`);
  console.log(name, "rejected");
}
const duplicate = points.map((p) => {
  const a = project(p, IDENTITY_POSE.rotation, [0, 0, 0]);
  return { a, b: a };
});
assert.equal(estimateRelativePose(duplicate, focal), null);
console.log("identical views rejected");
const direct = triangulateMatch(
  project(points[0], IDENTITY_POSE.rotation, [0, 0, 0]),
  project(points[0], R, t),
  IDENTITY_POSE,
  { rotation: R, translation: t },
  focal,
);
assert.ok(direct);
assert.ok(norm(direct.position.map((v, i) => v - points[0][i])) < 1e-8);
console.log("direct triangulation exact PASS");
