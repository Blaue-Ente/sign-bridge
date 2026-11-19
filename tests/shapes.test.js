'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Shapes = require('../src/core/shapes.js');
const Hand = require('../src/core/hand.js');

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const UMLAUTS = ['Ä', 'Ö', 'Ü', 'ß'];
const DIGRAPH_SIGNS = ['SCH', 'CH', 'AA'];

const euclid = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const idx = (name) => {
  const i = Hand.FEATURE_NAMES.indexOf(name);
  assert.notEqual(i, -1, `unknown feature ${name}`);
  return i;
};
const shapeFeatures = (name) => Hand.poseFeatures(Hand.normalizePose(Shapes.SHAPES[name].pose));

test('every letter of the German alphabet has a handshape', () => {
  for (const name of [...LATIN, ...UMLAUTS, ...DIGRAPH_SIGNS]) {
    assert.ok(Shapes.SHAPES[name], `missing shape ${name}`);
  }
});

test('J and Z are the only movement letters among A to Z', () => {
  assert.deepEqual(LATIN.filter((l) => Shapes.motionKindOf(Shapes.SHAPES[l])), ['J', 'Z']);
});

test('umlauts, ß and the digraph signs each have their own movement', () => {
  assert.equal(Shapes.motionKindOf(Shapes.SHAPES['Ä']), 'down');
  assert.equal(Shapes.motionKindOf(Shapes.SHAPES['Ö']), 'down');
  assert.equal(Shapes.motionKindOf(Shapes.SHAPES['Ü']), 'down');
  assert.equal(Shapes.motionKindOf(Shapes.SHAPES['ß']), 'updown');
  for (const name of DIGRAPH_SIGNS) assert.equal(Shapes.motionKindOf(Shapes.SHAPES[name]), 'side');
  assert.equal(Shapes.motionKindOf(Shapes.SHAPES.A), null);
  assert.equal(Shapes.motionKindOf(Shapes.SHAPES.J), 'wiggle');
});

test('shape definitions only use known joints', () => {
  const top = ['roll', 'pitch', 'index', 'middle', 'ring', 'pinky', 'thumb'];
  const finger = ['psi', 'mcp', 'pip', 'dip'];
  const thumb = ['psi', 'mcp', 'ip', 'tip'];
  for (const [name, def] of Object.entries(Shapes.SHAPES)) {
    for (const key of Object.keys(def.pose)) assert.ok(top.includes(key), `${name}: unknown key ${key}`);
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      if (def.pose[f]) for (const k of Object.keys(def.pose[f])) assert.ok(finger.includes(k), `${name}.${f}.${k}`);
    }
    if (def.pose.thumb) for (const k of Object.keys(def.pose.thumb)) assert.ok(thumb.includes(k), `${name}.thumb.${k}`);
  }
});

test('the German alphabet maps every letter to its own shape, ignoring case', () => {
  for (const letter of LATIN) {
    assert.equal(Shapes.lookupLetter(Shapes.DGS, letter), letter);
    assert.equal(Shapes.lookupLetter(Shapes.DGS, letter.toLowerCase()), letter);
  }
  assert.equal(Shapes.lookupLetter(Shapes.DGS, 'ä'), 'Ä');
  assert.equal(Shapes.lookupLetter(Shapes.DGS, 'Ä'), 'Ä');
  assert.equal(Shapes.lookupLetter(Shapes.DGS, 'ß'), 'ß');
});

test('the capital sharp s (ẞ) is the same letter as ß', () => {
  assert.equal(Shapes.lookupLetter(Shapes.DGS, 'ẞ'), 'ß');
});

test('characters that are not German letters have no handshape', () => {
  for (const ch of ['#', 'ñ', 'é', 'ё']) assert.equal(Shapes.lookupLetter(Shapes.DGS, ch), null, ch);
});

test('every shape named by the alphabet exists in the shape library', () => {
  for (const shape of Object.values(Shapes.DGS.letters)) assert.ok(Shapes.SHAPES[shape], `missing shape ${shape}`);
  for (const [, shape] of Shapes.DGS.digraphs) assert.ok(Shapes.SHAPES[shape], `missing shape ${shape}`);
});

test('letterForShape prints the German letters with their capitals', () => {
  assert.equal(Shapes.letterForShape(Shapes.DGS, 'A'), 'A');
  assert.equal(Shapes.letterForShape(Shapes.DGS, 'Ä'), 'Ä');
  assert.equal(Shapes.letterForShape(Shapes.DGS, 'ß'), 'ß');
  assert.equal(Shapes.letterForShape(Shapes.DGS, 'NOPE'), null);
});

test('lettersForShape lists the printed forms of a shape', () => {
  assert.deepEqual(Shapes.lettersForShape(Shapes.DGS, 'A'), ['A']);
  assert.deepEqual(Shapes.lettersForShape(Shapes.DGS, 'AA'), ['AA']);
  assert.deepEqual(Shapes.lettersForShape(Shapes.DGS, 'SCH'), ['SCH']);
});

test('caseLabel keeps ß and capitalises other letters', () => {
  assert.equal(Shapes.caseLabel('ß'), 'ß');
  assert.equal(Shapes.caseLabel('ä'), 'Ä');
  assert.equal(Shapes.caseLabel('a'), 'A');
});

test('recognizable shapes are the 24 still handshapes; no movement sign is recognized', () => {
  const names = Shapes.recognizableShapes();
  assert.equal(names.length, 24);
  for (const m of ['J', 'Z', 'Ä', 'Ö', 'Ü', 'ß', 'SCH', 'CH', 'AA']) assert.ok(!names.includes(m), m);
});

test('no two recognizable shapes look alike', () => {
  const names = Shapes.recognizableShapes();
  const vecs = names.map(shapeFeatures);
  let closest = Infinity;
  let pair = null;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const d = euclid(vecs[i], vecs[j]);
      if (d < closest) {
        closest = d;
        pair = `${names[i]}/${names[j]}`;
      }
    }
  }
  assert.ok(closest > 0.3, `${pair} are too similar (distance ${closest.toFixed(2)})`);
});

test('F pinches the thumb to the index finger, so its tips are much closer than in the open hand', () => {
  const open = Hand.poseFeatures(Hand.normalizePose({})); // open, relaxed hand
  const f = shapeFeatures('F');
  const name = 'thumb-tip.index-tip';
  assert.ok(f[idx(name)] < open[idx(name)] * 0.6, `F ${f[idx(name)]} vs open ${open[idx(name)]}`);
});
