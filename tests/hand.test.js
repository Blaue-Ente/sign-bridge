'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Hand = require('../src/core/hand.js');

const {
  FEATURE_NAMES,
  FEATURE_SCALES,
  normalizePose,
  modelLandmarks,
  toMediaPipe,
  features,
  featureVector,
  featuresFromLandmarks,
  lerpPose,
  perturbPose,
  makeRng,
  poseFeatures,
} = Hand;

const near = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} to be within ${eps} of ${expected}`);

const idx = (name) => {
  const i = FEATURE_NAMES.indexOf(name);
  assert.notEqual(i, -1, `unknown feature ${name}`);
  return i;
};

const mpLandmarks = (partialPose) => toMediaPipe(modelLandmarks(normalizePose(partialPose)));

// Rotates points: roll about the depth axis, then pitch about the horizontal axis.
function rotate(points, rollDeg, pitchDeg) {
  const r = (rollDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  return points.map(({ x, y, z }) => {
    const x1 = x * Math.cos(r) - y * Math.sin(r);
    const y1 = x * Math.sin(r) + y * Math.cos(r);
    return { x: x1, y: y1 * Math.cos(p) - z * Math.sin(p), z: y1 * Math.sin(p) + z * Math.cos(p) };
  });
}

test('there are 31 features and one positive scale per feature', () => {
  assert.equal(FEATURE_NAMES.length, 31);
  assert.equal(FEATURE_SCALES.length, FEATURE_NAMES.length);
  for (const s of FEATURE_SCALES) assert.ok(s > 0);
});

test('a pose produces 21 finite landmarks with the wrist at the origin', () => {
  const pts = modelLandmarks(normalizePose({}));
  assert.equal(pts.length, 21);
  for (const p of pts) for (const v of p) assert.ok(Number.isFinite(v));
  near(pts[0][0], 0);
  near(pts[0][1], 0);
  near(pts[0][2], 0);
});

test('toMediaPipe uses image conventions: y points down and z is negative toward the camera', () => {
  const [p] = toMediaPipe([[1, 2, 3]]);
  assert.deepEqual([p.x, p.y, p.z], [1, -2, -3]);
});

test('a curled finger bends at the middle joint far more than an open one', () => {
  const open = features(mpLandmarks({}));
  const fist = features(mpLandmarks({ middle: { mcp: 85, pip: 95, dip: 50 } }));
  const bend = idx('middle.pip');
  assert.ok(open[bend] < 0.05, `open finger bends by ${open[bend]}`);
  assert.ok(fist[bend] - open[bend] > 1.2, `curl only changed by ${fist[bend] - open[bend]}`);
});

test('an open finger reaches farther from the wrist than a curled one', () => {
  const open = features(mpLandmarks({}));
  const fist = features(mpLandmarks({ index: { mcp: 85, pip: 95, dip: 50 } }));
  assert.ok(open[idx('index.ext')] > fist[idx('index.ext')] + 0.5);
});

test('the position-free features do not change when the hand is rotated', () => {
  const base = mpLandmarks({ index: { mcp: 40, pip: 60 }, thumb: { psi: -35, mcp: 30 } });
  const a = features(base);
  const b = features(rotate(base, 35, 20));
  FEATURE_NAMES.forEach((name, i) => {
    if (name.startsWith('orient.')) return;
    assert.ok(Math.abs(a[i] - b[i]) < 1e-9, `${name} changed from ${a[i]} to ${b[i]}`);
  });
});

test('the features do not change when the hand is scaled', () => {
  const base = mpLandmarks({ ring: { mcp: 60 } });
  const big = base.map((p) => ({ x: p.x * 2.7, y: p.y * 2.7, z: p.z * 2.7 }));
  const a = features(base);
  const b = features(big);
  FEATURE_NAMES.forEach((name, i) => assert.ok(Math.abs(a[i] - b[i]) < 1e-9, name));
});

test('a mirrored hand gives the same features, so left and right hands share templates', () => {
  const base = mpLandmarks({ thumb: { psi: 20, mcp: 60 }, pinky: { mcp: 30 } });
  const mirrored = base.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
  const a = features(base);
  const b = features(mirrored);
  FEATURE_NAMES.forEach((name, i) => assert.ok(Math.abs(a[i] - b[i]) < 1e-9, name));
});

test('featuresFromLandmarks undoes the image aspect ratio of normalised landmarks', () => {
  const W = 640;
  const H = 480;
  const iso = mpLandmarks({ index: { mcp: 50 } });
  const normalised = iso.map((p) => ({ x: p.x / W, y: p.y / H, z: p.z / W }));
  const a = featuresFromLandmarks(normalised, W, H);
  const b = featureVector(iso);
  a.forEach((v, i) => near(v, b[i]));
});

test('featureVector divides each raw feature by its scale', () => {
  const lm = mpLandmarks({ middle: { mcp: 70 } });
  const raw = features(lm);
  const scaled = featureVector(lm);
  scaled.forEach((v, i) => near(v, raw[i] / FEATURE_SCALES[i], 1e-12));
});

test('poseFeatures equals featureVector of the same pose landmarks', () => {
  const pose = { index: { mcp: 60 } };
  const a = poseFeatures(pose);
  const b = featureVector(mpLandmarks(pose));
  a.forEach((v, i) => near(v, b[i]));
});

test('normalizePose fills unspecified joints with the neutral open hand', () => {
  const p = normalizePose({ index: { mcp: 80 } });
  assert.equal(p.index.mcp, 80);
  assert.equal(p.index.pip, 0);
  assert.equal(p.index.psi, -6);
  assert.equal(p.thumb.psi, -40);
  assert.equal(p.roll, 0);
  assert.equal(p.pitch, 0);
});

test('lerpPose blends numbers and keeps both endpoints', () => {
  const a = normalizePose({ roll: 0, index: { mcp: 0 } });
  const b = normalizePose({ roll: 90, index: { mcp: 80 } });
  assert.equal(lerpPose(a, b, 0).index.mcp, 0);
  assert.equal(lerpPose(a, b, 1).index.mcp, 80);
  assert.equal(lerpPose(a, b, 0.5).roll, 45);
  assert.equal(lerpPose(a, b, 0.5).index.mcp, 40);
});

test('makeRng is reproducible and returns values in [0, 1)', () => {
  const r1 = makeRng(7);
  const r2 = makeRng(7);
  const xs = Array.from({ length: 50 }, () => r1());
  assert.deepEqual(xs, Array.from({ length: 50 }, () => r2()));
  for (const x of xs) assert.ok(x >= 0 && x < 1);
});

test('perturbPose with zero sigma returns the same pose', () => {
  const base = normalizePose({ index: { mcp: 30 }, roll: 12 });
  assert.deepEqual(perturbPose(base, makeRng(3), 0), base);
});

test('perturbPose moves joints by a few degrees and does not change its input', () => {
  const base = normalizePose({ middle: { mcp: 40 } });
  const p = perturbPose(base, makeRng(5), 4);
  assert.notDeepEqual(p, base);
  assert.ok(Math.abs(p.middle.mcp - 40) < 25);
  assert.equal(base.middle.mcp, 40);
});
