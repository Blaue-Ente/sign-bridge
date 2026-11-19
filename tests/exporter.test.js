'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Translator = require('../src/core/translator.js');
const Shapes = require('../src/core/shapes.js');
const Hand = require('../src/core/hand.js');
const Exporter = require('../src/core/exporter.js');

const lookupShape = (name) => {
  const def = Shapes.SHAPES[name];
  return def
    ? { pose: Hand.normalizePose(def.pose), motion: !!def.motion, motionKind: Shapes.motionKindOf(def) }
    : null;
};

// The same stepped timeline the Buchstabieren tab plays.
const timeline = (text) => {
  const { steps } = Translator.buildPlan(text, { alphabet: Shapes.DGS, lookupShape, markUnsupported: true });
  return Translator.createTimeline(steps, { stepped: true, gapMs: 180 });
};

const labelsOf = (tl, rows) => rows.map((row) => row.map((i) => tl.steps[i].label));
const sumMs = (frames) => frames.filter((f) => f.phase !== 'end').reduce((a, f) => a + f.durationMs, 0);

test('the picture puts each word on its own row', () => {
  const tl = timeline('Guten Tag');
  assert.deepEqual(labelsOf(tl, Exporter.sheetRows(tl.steps, 8)), [['G', 'U', 'T', 'E', 'N'], ['T', 'A', 'G']]);
});

test('a long word wraps after maxCols pictures', () => {
  const tl = timeline('abcdefghij');
  assert.deepEqual(Exporter.sheetRows(tl.steps, 4).map((r) => r.length), [4, 4, 2]);
});

test('pauses at the start, at the end or in a row never leave an empty row', () => {
  const tl = timeline('  Hi,  du! ');
  assert.deepEqual(labelsOf(tl, Exporter.sheetRows(tl.steps, 8)), [['H', 'I'], ['D', 'U']]);
});

test('a character without a sign stays in its word and keeps its kind', () => {
  const tl = timeline('Çem');
  const rows = Exporter.sheetRows(tl.steps, 8);
  assert.deepEqual(rows.map((r) => r.map((i) => tl.steps[i].kind)), [['unsupported', 'sign', 'sign']]);
});

test('the animation shows each handshape as one still frame, with an empty gap before every later one', () => {
  const tl = timeline('Hallo');
  const frames = Exporter.animationFrames(tl, { speed: 1 });
  const names = frames.map((f) => f.phase + (f.phase === 'end' ? '' : ':' + tl.steps[f.index].label));
  // LL: the gap between the two L frames makes the repeated letter visible.
  assert.deepEqual(names, ['hold:H', 'gap:A', 'hold:A', 'gap:L', 'hold:L', 'gap:L', 'hold:L', 'gap:O', 'hold:O', 'end']);
});

test('every frame samples the timeline at a moment of its own step and phase', () => {
  const tl = timeline('Guten Tag, Çem');
  for (const f of Exporter.animationFrames(tl, { speed: 1 }).filter((x) => x.phase !== 'end')) {
    const sample = Translator.sampleTimeline(tl, f.atMs);
    assert.equal(sample.index, f.index);
    assert.equal(sample.phase, f.phase);
  }
});

test('frame durations follow the timeline and the playback speed', () => {
  const tl = timeline('Hallo');
  const normal = Exporter.animationFrames(tl, { speed: 1, endPauseMs: 1000 });
  const fast = Exporter.animationFrames(tl, { speed: 2, endPauseMs: 1000 });
  assert.equal(sumMs(normal), tl.total - tl.steps[0].move); // no gap before the first letter
  assert.equal(sumMs(fast), sumMs(normal) / 2);
  assert.equal(normal[normal.length - 1].durationMs, 1000);
});

test('a movement letter is split into equal frames across its hold', () => {
  const tl = timeline('Ä');
  const holds = Exporter.animationFrames(tl, { speed: 1, motionFrameMs: 80 }).filter((f) => f.phase === 'hold');
  const hold = tl.steps[0].hold;
  assert.equal(holds.length, Math.round(hold / 80));
  assert.ok(Math.abs(sumMs(holds) - hold) < 1e-9);
  for (let k = 1; k < holds.length; k++) assert.ok(holds[k].atMs > holds[k - 1].atMs);
  assert.ok(holds.every((f) => f.durationMs >= 40));
});

test('file names are short, ASCII only and spell out umlauts', () => {
  assert.equal(Exporter.fileSlug('Guten Tag!'), 'guten-tag');
  assert.equal(Exporter.fileSlug('Grüße aus Köln'), 'gruesse-aus-koeln');
  assert.equal(Exporter.fileSlug('Çem'), 'cem');
  assert.equal(Exporter.fileSlug('  ?! '), 'fingeralphabet');
  const long = Exporter.fileSlug('a'.repeat(30) + ' ' + 'b'.repeat(30));
  assert.ok(long.length <= 40);
  assert.ok(!long.endsWith('-'));
});
