'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Translator = require('../src/core/translator.js');
const Shapes = require('../src/core/shapes.js');
const Hand = require('../src/core/hand.js');

const lookupShape = (name) => {
  const def = Shapes.SHAPES[name];
  return def
    ? { pose: Hand.normalizePose(def.pose), motion: !!def.motion, motionKind: Shapes.motionKindOf(def) }
    : null;
};

const plan = (text, dictionary = {}) =>
  Translator.buildPlan(text, { alphabet: Shapes.DGS, dictionary, lookupShape });

const REST = Hand.normalizePose({});

test('fingerspells the letters of a word in order', () => {
  const { steps } = plan('Hi');
  assert.deepEqual(steps.map((s) => s.kind), ['sign', 'sign']);
  assert.deepEqual(steps.map((s) => s.label), ['H', 'I']);
  assert.deepEqual(steps.map((s) => s.shape), ['H', 'I']);
});

test('whitespace between words becomes a single rest step', () => {
  const { steps } = plan('hi   there');
  assert.deepEqual(steps.map((s) => s.kind), ['sign', 'sign', 'rest', 'sign', 'sign', 'sign', 'sign', 'sign']);
});

test('punctuation and digits become pauses and are neither spelled nor reported', () => {
  const r = plan('ok, 2!');
  assert.deepEqual(r.steps.map((s) => s.kind), ['sign', 'sign', 'rest']);
  assert.deepEqual(r.skipped, []);
});

test('characters that are not German letters are skipped and reported', () => {
  const r = plan('hçi');
  assert.deepEqual(r.steps.map((s) => s.label), ['H', 'I']);
  assert.deepEqual(r.skipped, ['ç']);
});

test('a dictionary word replaces fingerspelling for that word', () => {
  const dictionary = { hi: [{ shape: 'B', hold: 300 }] };
  const { steps } = plan('Hi there', dictionary);
  assert.equal(steps[0].kind, 'sign');
  assert.equal(steps[0].label, 'Hi');
  assert.equal(steps[0].shape, 'B');
  assert.equal(steps[0].hold, 300);
});

test('ä, ö, ü and ß are signed with their own handshapes', () => {
  const r = plan('öäüß');
  assert.deepEqual(r.steps.map((s) => s.shape), ['Ö', 'Ä', 'Ü', 'ß']);
  assert.deepEqual(r.steps.map((s) => s.label), ['Ö', 'Ä', 'Ü', 'ß']);
});

test('the capital sharp s (ẞ) is signed like ß', () => {
  const r = plan('STRAẞE');
  assert.deepEqual(r.steps.map((s) => s.shape), ['S', 'T', 'R', 'A', 'ß', 'E']);
  assert.equal(r.steps[4].label, 'ß');
});

test('sch, ch and aa are each one sign', () => {
  assert.deepEqual(plan('schön').steps.map((s) => s.shape), ['SCH', 'Ö', 'N']);
  assert.deepEqual(plan('Chor').steps.map((s) => s.shape), ['CH', 'O', 'R']);
  assert.deepEqual(plan('Haar').steps.map((s) => s.shape), ['H', 'AA', 'R']);
});

test('digraphs are matched from the left, so Schach reads SCH-A-CH', () => {
  assert.deepEqual(plan('Schach').steps.map((s) => s.shape), ['SCH', 'A', 'CH']);
  assert.deepEqual(plan('Schach').steps.map((s) => s.label), ['SCH', 'A', 'CH']);
});

test('movement signs are flagged and their movement kind is passed on', () => {
  const r = plan('jzäß');
  assert.deepEqual(r.steps.map((s) => s.motion), [true, true, true, true]);
  assert.deepEqual(r.steps.map((s) => s.motionKind), ['wiggle', 'wiggle', 'down', 'updown']);
});

test('letters hold longer than the rest between words', () => {
  const r = plan('a b');
  const letter = r.steps.find((s) => s.kind === 'sign');
  const rest = r.steps.find((s) => s.kind === 'rest');
  assert.ok(letter.hold > rest.hold);
});

test('createTimeline computes start times from move and hold durations', () => {
  const steps = [
    { kind: 'sign', move: 100, hold: 200, pose: REST, motion: false },
    { kind: 'sign', move: 100, hold: 300, pose: REST, motion: false },
  ];
  const tl = Translator.createTimeline(steps);
  assert.deepEqual(tl.starts, [0, 300]);
  assert.equal(tl.total, 700);
});

test('sampleTimeline moves toward a handshape, then holds it', () => {
  const target = Hand.normalizePose({ index: { mcp: 80 } });
  const tl = Translator.createTimeline([{ kind: 'sign', move: 200, hold: 400, pose: target, motion: false }]);

  const start = Translator.sampleTimeline(tl, 0);
  assert.equal(start.phase, 'move');
  assert.equal(start.pose.index.mcp, 0);

  const mid = Translator.sampleTimeline(tl, 100); // halfway through the move; easing is symmetric
  assert.equal(mid.phase, 'move');
  assert.ok(Math.abs(mid.pose.index.mcp - 40) < 1e-9);

  const hold = Translator.sampleTimeline(tl, 350);
  assert.equal(hold.phase, 'hold');
  assert.equal(hold.pose.index.mcp, 80);
});

test('each step starts moving from the handshape of the previous step', () => {
  const a = Hand.normalizePose({ index: { mcp: 80 } });
  const b = Hand.normalizePose({ index: { mcp: 20 } });
  const tl = Translator.createTimeline([
    { kind: 'sign', move: 100, hold: 100, pose: a, motion: false },
    { kind: 'sign', move: 100, hold: 100, pose: b, motion: false },
  ]);
  const atStart = Translator.sampleTimeline(tl, 200);
  assert.equal(atStart.index, 1);
  assert.equal(atStart.phase, 'move');
  assert.ok(Math.abs(atStart.pose.index.mcp - 80) < 1e-9);
  const mid = Translator.sampleTimeline(tl, 250);
  assert.ok(Math.abs(mid.pose.index.mcp - 50) < 1e-9);
});

test('wiggle movements (J, Z) swing the roll while they are held', () => {
  const tl = Translator.createTimeline([
    { kind: 'sign', move: 100, hold: 1000, pose: REST, motion: true, motionKind: 'wiggle' },
  ]);
  const a = Translator.sampleTimeline(tl, 300).pose.roll;
  const b = Translator.sampleTimeline(tl, 500).pose.roll;
  assert.notEqual(a, 0);
  assert.notEqual(a, b);
});

test('umlaut signs move down while they are held', () => {
  const tl = Translator.createTimeline([
    { kind: 'sign', move: 100, hold: 1000, pose: REST, motion: true, motionKind: 'down' },
  ]);
  const s = Translator.sampleTimeline(tl, 500); // 400 ms into the hold: the lowest point of the movement
  assert.equal(s.phase, 'hold');
  assert.ok(s.offset.y < -0.25, `offset ${s.offset.y}`);
  assert.equal(s.pose.roll, 0);
});

test('ß moves up and down, and the digraph signs move sideways', () => {
  const up = Translator.createTimeline([
    { kind: 'sign', move: 100, hold: 1000, pose: REST, motion: true, motionKind: 'updown' },
  ]);
  const side = Translator.createTimeline([
    { kind: 'sign', move: 100, hold: 1000, pose: REST, motion: true, motionKind: 'side' },
  ]);
  const u = Translator.sampleTimeline(up, 300); // 200 ms into the hold: top of the movement
  assert.ok(u.offset.y > 0.15, `offset ${u.offset.y}`);
  const s = Translator.sampleTimeline(side, 300);
  assert.ok(s.offset.x > 0.2, `offset ${s.offset.x}`);
  assert.equal(s.offset.y, 0);
});

// ---- Stepped playback (Buchstabieren): whole frames, no generated in-between hand poses ----

const stepped = (text, gapMs = 150) => {
  const r = Translator.buildPlan(text, { alphabet: Shapes.DGS, lookupShape, markUnsupported: true });
  return Translator.createTimeline(r.steps, { stepped: true, gapMs });
};

test('markUnsupported keeps unsupported characters as visible steps and still reports them', () => {
  const r = Translator.buildPlan('hçi', { alphabet: Shapes.DGS, lookupShape, markUnsupported: true });
  assert.deepEqual(r.steps.map((s) => s.kind), ['sign', 'unsupported', 'sign']);
  assert.equal(r.steps[1].label, 'ç');
  assert.deepEqual(r.skipped, ['ç']);
});

test('stepped playback never shows a pose that is not one of the handshapes', () => {
  const tl = stepped('Hallo');
  const poses = tl.steps.map((s) => JSON.stringify(s.pose));
  for (let ms = 0; ms < tl.total; ms += 10) {
    const s = Translator.sampleTimeline(tl, ms);
    if (s.pose === null) continue;
    assert.ok(poses.includes(JSON.stringify(s.pose)), `in-between pose at ${ms} ms`);
  }
});

test('stepped playback separates a repeated letter (LL) with an empty gap', () => {
  const tl = stepped('ll', 150);
  assert.deepEqual(tl.steps.map((s) => s.label), ['L', 'L']);
  const gap = Translator.sampleTimeline(tl, tl.starts[1] + 10);
  assert.equal(gap.index, 1);
  assert.equal(gap.phase, 'gap');
  assert.equal(gap.pose, null);
  const shown = Translator.sampleTimeline(tl, tl.starts[1] + 200);
  assert.equal(shown.phase, 'hold');
  assert.equal(shown.pose, tl.steps[1].pose);
});

test('stepped playback shows no hand for word pauses and unsupported characters', () => {
  const tl = stepped('a ç');
  assert.deepEqual(tl.steps.map((s) => s.kind), ['sign', 'rest', 'unsupported']);
  for (const i of [1, 2]) {
    const s = Translator.sampleTimeline(tl, tl.starts[i] + tl.steps[i].move + 10);
    assert.equal(s.phase, 'hold');
    assert.equal(s.pose, null);
  }
});

test('smooth playback is still the default', () => {
  const tl = Translator.createTimeline(plan('ab').steps);
  assert.equal(Translator.sampleTimeline(tl, tl.starts[1] + 10).phase, 'move');
});

test('sampleTimeline reports done after the last step, and an empty plan has nothing to show', () => {
  const tl = Translator.createTimeline([{ kind: 'rest', move: 0, hold: 100, pose: REST, motion: false }]);
  const r = Translator.sampleTimeline(tl, 500);
  assert.equal(r.phase, 'done');
  assert.equal(r.index, 0);
  assert.equal(Translator.sampleTimeline(Translator.createTimeline([]), 0), null);
});
