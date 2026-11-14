import assert from "node:assert/strict";
import { matchRectified, densify } from "../src/lib/dense-stereo.ts";
const width = 180,
  height = 100,
  n = width * height,
  mask = new Uint8Array(n).fill(1);
let seed = 917;
const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 24;
const l = Uint8Array.from({ length: n }, random),
  r = new Uint8Array(n);
const expected = 18;
for (let y = 0; y < height; y++)
  for (let x = 0; x < width - expected; x++) r[y * width + x] = l[y * width + x + expected];
const result = matchRectified(l, r, mask, mask, width, height, 4, 32);
const valid = Array.from(result.disparity).filter((d) => d > 0);
assert.ok(valid.length > n * 0.6);
assert.ok(valid.filter((d) => d === expected).length / valid.length > 0.99);
const flat = matchRectified(
  new Uint8Array(n).fill(90),
  new Uint8Array(n).fill(90),
  mask,
  mask,
  width,
  height,
  4,
  32,
);
assert.equal(flat.accepted, 0);
const missing = matchRectified(l, r, new Uint8Array(n), mask, width, height, 4, 32);
assert.equal(missing.accepted, 0);
const other = Uint8Array.from({ length: n }, random);
const unrelated = matchRectified(l, other, mask, mask, width, height, 4, 32);
assert.ok(unrelated.accepted < n * 0.015);
console.log(
  "PASS dense known-disparity >99% correct, >60% coverage, flat/invalid masks/unrelated rejected",
  result.accepted,
);

// End-to-end geometry, independent of SfM: a textured plane at z=8, known cameras.
// The baseline and focal imply disparity=36. The reconstructed depth must recover 8.
const w = 640,
  h = 320,
  focal = 576,
  baseline = 0.5,
  z = 8,
  d = (focal * baseline) / z;
const texture = Uint8Array.from({ length: w * h }, random);
const rgba = (offset) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4,
        value = x + offset < w ? texture[y * w + x + offset] : 0;
      data[k] = data[k + 1] = data[k + 2] = value;
      data[k + 3] = 255;
    }
  return data;
};
const images = [
  { name: "left", width: w, height: h, rgba: rgba(0) },
  { name: "right", width: w, height: h, rgba: rgba(d) },
];
const rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const cameras = [
  { imageIndex: 0, focal, pose: { rotation, translation: [0, 0, 0] } },
  { imageIndex: 1, focal, pose: { rotation, translation: [-baseline, 0, 0] } },
];
const sparse = Array.from({ length: 40 }, (_, i) => ({
  x: ((i % 8) - 4) * 0.2,
  y: (Math.floor(i / 8) - 2) * 0.2,
  z,
  r: 120,
  g: 120,
  b: 120,
}));
const dense = densify(images, cameras, sparse, () => {});
assert.ok(dense.points.length > 10000, "recover a surface, not only the sparse seed");
assert.ok(
  dense.points.every((p) => Math.abs(p.z - z) < 1e-8),
  "known depth and rectification",
);
assert.ok(
  dense.points.some((p) => p.x < 0) && dense.points.some((p) => p.x > 0),
  "camera/world transform",
);
assert.equal(dense.statistics.pairs, 1);
assert.equal(dense.statistics.pointLimitReached, false);
assert.throws(() => densify(images, [], sparse, () => {}), /cámaras/);
assert.throws(
  () =>
    densify(
      images.map((i) => ({ ...i, rgba: new Uint8ClampedArray(i.rgba.length).fill(127) })),
      cameras,
      sparse,
      () => {},
    ),
  /suficiente apoyo/,
);
console.log(
  "PASS dense known plane geometry, empty cameras and textureless depth rejection",
  dense.points.length,
);
