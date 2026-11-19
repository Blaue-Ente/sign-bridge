/*
 * Text to sign: plan and animation timeline.
 *
 * buildPlan() turns text into steps: one step per handshape, plus rest steps for word gaps and
 * punctuation. Multi-letter signs of the alphabet (SCH, CH, AA) are matched first, from the left.
 * Words in the dictionary are signed with their own frames instead. createTimeline() and
 * sampleTimeline() give the pose and the movement offset to draw at any moment, moving smoothly
 * from one handshape to the next.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && !!module.exports;
  const ns = isNode ? null : root.SignBridge;
  const api = factory(
    isNode ? require('./hand.js') : ns.Hand,
    isNode ? require('./shapes.js') : ns.Shapes
  );
  if (isNode) module.exports = api;
  else ns.Translator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Hand, Shapes) {
  'use strict';

  const DEFAULT_TIMING = { moveMs: 260, holdMs: 650, restMs: 400 };
  const WIGGLE_DEG = 14; // roll swing for 'wiggle' movements (J, Z)
  const WIGGLE_PERIOD_MS = 700;
  const MOVE_PERIOD_MS = 800; // one down-up or side-to-side cycle of the other movements
  const REST = Hand.normalizePose({});
  const NO_OFFSET = { x: 0, y: 0 };

  const ease = (t) => t * t * (3 - 2 * t);
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  function buildPlan(text, options) {
    const alphabet = options.alphabet;
    const dictionary = options.dictionary || {};
    const lookupShape = options.lookupShape;
    const timing = Object.assign({}, DEFAULT_TIMING, options.timing || {});
    const digraphs = (alphabet.digraphs || []).map(([letters, shape]) => ({
      text: letters,
      chars: Array.from(letters),
      shape,
    }));
    const steps = [];
    const skipped = [];

    const addRest = () => {
      const last = steps[steps.length - 1];
      if (last && last.kind === 'rest') return; // consecutive pauses merge into one
      steps.push({
        kind: 'rest', label: '', char: '', shape: null, pose: REST, motion: false, motionKind: null,
        move: timing.moveMs, hold: timing.restMs,
      });
    };

    const addSign = (shape, label, char, hold) => {
      const info = lookupShape(shape);
      if (!info) {
        if (!skipped.includes(label)) skipped.push(label);
        return;
      }
      steps.push({
        kind: 'sign', label, char, shape, pose: info.pose,
        motion: !!info.motion,
        motionKind: info.motion ? info.motionKind || 'wiggle' : null,
        move: timing.moveMs, hold: hold == null ? timing.holdMs : hold,
      });
    };

    // A run of letters is one word; every other character is a pause.
    for (const token of String(text).match(/\p{L}+|[^\p{L}]/gu) || []) {
      if (!/^\p{L}/u.test(token)) {
        addRest();
        continue;
      }
      const key = token.toLocaleLowerCase();
      if (hasOwn(dictionary, key)) {
        for (const frame of dictionary[key]) addSign(frame.shape, token, key, frame.hold);
        continue;
      }
      const chars = Array.from(key);
      let i = 0;
      while (i < chars.length) {
        const digraph = digraphs.find((d) => Array.from(d.text).every((c, k) => chars[i + k] === c));
        if (digraph) {
          addSign(digraph.shape, digraph.text.toLocaleUpperCase(), digraph.text, undefined);
          i += digraph.chars.length;
          continue;
        }
        const ch = chars[i];
        const shape = Shapes.lookupLetter(alphabet, ch);
        if (shape) addSign(shape, Shapes.caseLabel(ch), ch, undefined);
        else {
          if (!skipped.includes(ch)) skipped.push(ch);
          if (options.markUnsupported) {
            steps.push({
              kind: 'unsupported', label: ch, char: ch, shape: null, pose: null, motion: false, motionKind: null,
              move: timing.moveMs, hold: timing.restMs,
            });
          }
        }
        i += 1;
      }
    }
    return { steps, skipped };
  }

  // options.stepped: show whole handshapes only. The move phase becomes a short empty gap
  // (gapMs), so no in-between hand poses are generated and a repeated letter is seen twice.
  // Pauses and unsupported characters show no hand.
  function createTimeline(steps, options) {
    const stepped = !!(options && options.stepped);
    const gapMs = options && options.gapMs != null ? options.gapMs : 150;
    const used = stepped ? steps.map((s) => Object.assign({}, s, { move: gapMs })) : steps;
    const starts = [];
    let t = 0;
    for (const s of used) {
      starts.push(t);
      t += s.move + s.hold;
    }
    return { steps: used, starts, total: t, stepped };
  }

  // Offset of a movement sign, in model units, t milliseconds into the hold.
  function motionOffset(kind, t) {
    const phase = (2 * Math.PI * t) / MOVE_PERIOD_MS;
    if (kind === 'down') return { x: 0, y: -0.3 * (0.5 - 0.5 * Math.cos(phase)) };
    if (kind === 'updown') return { x: 0, y: 0.2 * Math.sin(phase) };
    if (kind === 'side') return { x: 0.25 * Math.sin(phase), y: 0 };
    return NO_OFFSET;
  }

  // Pose and offset to draw at timeMs: a move from the previous handshape, then a hold.
  function sampleTimeline(tl, timeMs) {
    const n = tl.steps.length;
    if (n === 0) return null;
    if (timeMs >= tl.total) {
      const last = tl.steps[n - 1];
      const pose = tl.stepped && last.kind !== 'sign' ? null : last.pose;
      return { index: n - 1, phase: 'done', pose, offset: NO_OFFSET, step: last, local: last.move + last.hold };
    }

    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tl.starts[mid] <= timeMs) lo = mid;
      else hi = mid - 1;
    }

    const step = tl.steps[lo];
    const local = Math.max(0, timeMs - tl.starts[lo]);
    if (tl.stepped) {
      if (local < step.move) return { index: lo, phase: 'gap', pose: null, offset: NO_OFFSET, step, local };
      if (step.kind !== 'sign') return { index: lo, phase: 'hold', pose: null, offset: NO_OFFSET, step, local };
    }
    if (local < step.move) {
      const from = lo > 0 ? tl.steps[lo - 1].pose : REST;
      const k = step.move > 0 ? ease(local / step.move) : 1;
      return { index: lo, phase: 'move', pose: Hand.lerpPose(from, step.pose, k), offset: NO_OFFSET, step, local };
    }

    let pose = step.pose;
    let offset = NO_OFFSET;
    if (step.motion) {
      const kind = step.motionKind || 'wiggle';
      const t = local - step.move;
      if (kind === 'wiggle') {
        pose = Object.assign({}, pose, { roll: pose.roll + WIGGLE_DEG * Math.sin((2 * Math.PI * t) / WIGGLE_PERIOD_MS) });
      } else {
        offset = motionOffset(kind, t);
      }
    }
    return { index: lo, phase: 'hold', pose, offset, step, local };
  }

  return { DEFAULT_TIMING, buildPlan, createTimeline, sampleTimeline, motionOffset };
});
