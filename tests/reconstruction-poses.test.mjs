import assert from "node:assert/strict";
import { estimateRelativePose, triangulateMatch } from "../src/lib/reconstruction-geometry.ts";
let seed = 921345;
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const mul = (a, b) =>
  Array.from({ length: 9 }, (_, i) =>
    [0, 1, 2].reduce((s, k) => s + a[Math.floor(i / 3) * 3 + k] * b[k * 3 + (i % 3)], 0),
  );
const rot = (x, y, z) =>
  mul(
    mul(
      [Math.cos(z), -Math.sin(z), 0, Math.sin(z), Math.cos(z), 0, 0, 0, 1],
      [Math.cos(y), 0, Math.sin(y), 0, 1, 0, -Math.sin(y), 0, Math.cos(y)],
    ),
    [1, 0, 0, 0, Math.cos(x), -Math.sin(x), 0, Math.sin(x), Math.cos(x)],
  );
const unit = (a) => {
  const n = Math.hypot(...a);
  return a.map((x) => x / n);
};
const project = (p, { rotation: r, translation: t }) => {
  const q = [0, 1, 2].map((i) => t[i] + [0, 1, 2].reduce((s, k) => s + r[i * 3 + k] * p[k], 0));
  return [q[0] / q[2], q[1] / q[2]];
};
for (let trial = 0; trial < 8; trial++) {
  const p1 = { rotation: rot(0, 0, 0), translation: [0, 0, 0] },
    p2 = {
      rotation: rot((rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2),
      translation: unit([(rand() - 0.5) * 2, (rand() - 0.5) * 1, (rand() - 0.5) * 1]),
    };
  const ps = Array.from({ length: 240 }, () => [
    (rand() - 0.5) * 5,
    (rand() - 0.5) * 4,
    4 + rand() * 8,
  ]);
  const ms = ps.map((p, i) => ({
    a: project(p, p1).map((v) => v + ((rand() - 0.5) * 0.4) / 900),
    b:
      i < 60
        ? [rand() - 0.5, rand() - 0.5]
        : project(p, p2).map((v) => v + ((rand() - 0.5) * 0.4) / 900),
  }));
  const r = estimateRelativePose(ms, 900);
  assert.ok(r, `trial ${trial}`);
  const e = Math.max(...p2.rotation.map((v, i) => Math.abs(v - r.pose.rotation[i]))),
    d = p2.translation.reduce((s, v, i) => s + v * r.pose.translation[i], 0);
  assert.ok(e < 0.04, `trial ${trial} rotation ${e}`);
  assert.ok(d > 0.98, `trial ${trial} translation ${d}`);
  console.log(
    "random scene",
    trial,
    "points",
    r.points.length,
    "Rerror",
    e.toFixed(5),
    "Talignment",
    d.toFixed(5),
  );
}
const p1 = { rotation: rot(0.2, 0.1, -0.03), translation: [0.1, -0.2, 0.3] },
  p2 = { rotation: rot(-0.06, 0.02, 0.07), translation: [-0.7, 0.3, 0.2] },
  p = [0.5, 0.3, 6];
const r = triangulateMatch(project(p, p1), project(p, p2), p1, p2, 900);
assert.ok(r);
assert.ok(Math.hypot(...r.position.map((v, i) => v - p[i])) < 1e-8);
console.log("arbitrary two-pose world triangulation PASS");
