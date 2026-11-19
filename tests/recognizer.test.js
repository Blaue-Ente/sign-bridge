'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Recognizer = require('../src/core/recognizer.js');
const Hand = require('../src/core/hand.js');
const Shapes = require('../src/core/shapes.js');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const poseFor = (name) => Hand.normalizePose(Shapes.SHAPES[name].pose);

test('classify returns the shape of the nearest prototype', () => {
  const c = Recognizer.createClassifier({ prototypes: { A: [[0, 0]], B: [[10, 10]] }, threshold: 5 });
  const r = c.classify([1, 1]);
  assert.equal(r.shape, 'A');
  assert.ok(Math.abs(r.distance - Math.SQRT2) < 1e-12);
  assert.equal(r.accepted, true);
});

test('a shape is as close as its nearest prototype', () => {
  const c = Recognizer.createClassifier({ prototypes: { A: [[0, 0], [3, 0]], B: [[10, 0]] }, threshold: 5 });
  const r = c.classify([2.9, 0]);
  assert.equal(r.shape, 'A');
  assert.ok(Math.abs(r.distance - 0.1) < 1e-9);
});

test('a match beyond the threshold is reported but not accepted', () => {
  const c = Recognizer.createClassifier({ prototypes: { A: [[0, 0]] }, threshold: 1 });
  const r = c.classify([5, 0]);
  assert.equal(r.shape, 'A');
  assert.equal(r.accepted, false);
});

test('classify returns null when there are no prototypes', () => {
  assert.equal(Recognizer.createClassifier({ prototypes: {}, threshold: 1 }).classify([0]), null);
});

test('the stabilizer emits a shape only after enough agreeing frames', () => {
  const s = Recognizer.createStabilizer({ windowSize: 8, required: 6, releaseMs: 500 });
  let t = 0;
  const out = [];
  for (let i = 0; i < 5; i++) out.push(s.push('A', (t += 50)));
  assert.deepEqual(out, [null, null, null, null, null]);
  assert.equal(s.push('A', (t += 50)), 'A');
});

test('the stabilizer does not repeat a shape while the hand stays on it', () => {
  const s = Recognizer.createStabilizer({ windowSize: 8, required: 6, releaseMs: 500 });
  let t = 0;
  for (let i = 0; i < 6; i++) s.push('A', (t += 50));
  for (let i = 0; i < 20; i++) assert.equal(s.push('A', (t += 50)), null);
});

test('the stabilizer ignores flickering between two shapes', () => {
  const s = Recognizer.createStabilizer({ windowSize: 8, required: 6, releaseMs: 500 });
  let t = 0;
  for (let i = 0; i < 20; i++) assert.equal(s.push(i % 2 ? 'A' : 'B', (t += 50)), null);
});

test('the stabilizer emits a new shape once it is stable', () => {
  const s = Recognizer.createStabilizer({ windowSize: 8, required: 6, releaseMs: 500 });
  let t = 0;
  for (let i = 0; i < 6; i++) s.push('A', (t += 50));
  let emitted = null;
  for (let i = 0; i < 6; i++) emitted = s.push('B', (t += 50)) || emitted;
  assert.equal(emitted, 'B');
});

test('the stabilizer emits the same shape again only after the hand has been released', () => {
  const s = Recognizer.createStabilizer({ windowSize: 8, required: 6, releaseMs: 500 });
  let t = 0;
  for (let i = 0; i < 6; i++) s.push('A', (t += 50));
  for (let i = 0; i < 7; i++) s.push(null, (t += 100));
  let emitted = null;
  for (let i = 0; i < 6; i++) emitted = s.push('A', (t += 50)) || emitted;
  assert.equal(emitted, 'A');
});

test('calibration samples persist under one key and reload', () => {
  const storage = memoryStorage();
  const first = Recognizer.createCalibrationStore(storage, 'k');
  first.add('A', [1, 2]);
  first.add('A', [3, 4]);
  const second = Recognizer.createCalibrationStore(storage, 'k');
  assert.deepEqual(second.samples('A'), [[1, 2], [3, 4]]);
});

test('each shape keeps only its newest samples', () => {
  const store = Recognizer.createCalibrationStore(memoryStorage(), 'k', 30);
  for (let i = 0; i < 35; i++) store.add('B', [i]);
  const s = store.samples('B');
  assert.equal(s.length, 30);
  assert.deepEqual(s[0], [5]);
  assert.deepEqual(s[29], [34]);
});

test('a storage that throws does not break the store and keeps samples in memory', () => {
  const broken = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('full');
    },
    removeItem() {
      throw new Error('denied');
    },
  };
  const store = Recognizer.createCalibrationStore(broken, 'k');
  assert.deepEqual(store.samples('A'), []);
  assert.doesNotThrow(() => store.add('A', [1]));
  assert.deepEqual(store.samples('A'), [[1]]);
});

test('clear removes one shape or everything', () => {
  const store = Recognizer.createCalibrationStore(memoryStorage(), 'k');
  store.add('A', [1]);
  store.add('B', [2]);
  store.clear('A');
  assert.deepEqual(store.samples('A'), []);
  assert.deepEqual(store.samples('B'), [[2]]);
  store.clear();
  assert.deepEqual(store.all(), {});
});

test('calibrated samples replace the defaults once a shape has enough of them', () => {
  const defaults = { A: [[0]], B: [[0]] };
  const calibrated = { A: [[5], [5], [5], [5], [5]], B: [[7]] };
  const merged = Recognizer.mergePrototypes(defaults, calibrated, 5);
  assert.deepEqual(merged.A, [[5], [5], [5], [5], [5]]);
  assert.deepEqual(merged.B, [[0], [7]]);
});

test('buildPrototypes makes the requested number of variants, reproducibly', () => {
  const options = {
    shapes: ['A', 'B'],
    poseFor,
    featuresFor: Hand.poseFeatures,
    variants: 7,
    sigmaDeg: 4,
  };
  const a = Recognizer.buildPrototypes({ ...options, rng: Hand.makeRng(42) });
  const b = Recognizer.buildPrototypes({ ...options, rng: Hand.makeRng(42) });
  assert.equal(a.A.length, 7);
  assert.equal(a.B.length, 7);
  assert.deepEqual(a, b);
});

test('the default prototypes recognise perturbed model poses of each recognizable shape', () => {
  const shapes = Shapes.recognizableShapes();
  const prototypes = Recognizer.buildPrototypes({
    shapes,
    poseFor,
    featuresFor: Hand.poseFeatures,
    variants: 7,
    rng: Hand.makeRng(1),
    sigmaDeg: 4,
  });
  const classifier = Recognizer.createClassifier({ prototypes, threshold: Recognizer.DEFAULT_THRESHOLD });
  const rng = Hand.makeRng(99);
  let total = 0;
  let correct = 0;
  const misses = [];
  for (const name of shapes) {
    for (let i = 0; i < 12; i++) {
      const r = classifier.classify(Hand.poseFeatures(Hand.perturbPose(poseFor(name), rng, 4)));
      total++;
      if (r.shape === name && r.accepted) correct++;
      else misses.push(`${name}->${r.shape}`);
    }
  }
  const accuracy = correct / total;
  assert.ok(accuracy >= 0.9, `accuracy ${accuracy.toFixed(2)}; misses: ${misses.slice(0, 20).join(', ')}`);
});

test('an open hand is not accepted as a letter', () => {
  const prototypes = Recognizer.buildPrototypes({
    shapes: Shapes.recognizableShapes(),
    poseFor,
    featuresFor: Hand.poseFeatures,
    variants: 7,
    rng: Hand.makeRng(1),
    sigmaDeg: 4,
  });
  const classifier = Recognizer.createClassifier({ prototypes, threshold: Recognizer.DEFAULT_THRESHOLD });
  const r = classifier.classify(Hand.poseFeatures(Hand.normalizePose({})));
  assert.equal(r.accepted, false, `open hand matched ${r.shape} at ${r.distance.toFixed(2)}`);
});
