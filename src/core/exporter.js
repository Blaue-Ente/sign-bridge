/*
 * Export plan for the Buchstabieren tab: which steps go on which row of the picture, which
 * moments of the timeline become animation frames, and a file name for the text.
 * The drawing itself happens in src/ui/export.js; nothing here touches the page.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SignBridge = root.SignBridge || {}).Exporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULTS = { speed: 1, motionFrameMs: 80, endPauseMs: 1000 };

  // Step indices for the picture: one row per word, a pause starts a new row, and a word
  // longer than maxCols wraps. Pauses themselves get no picture.
  function sheetRows(steps, maxCols) {
    const rows = [];
    let row = [];
    const flush = () => {
      if (row.length) rows.push(row);
      row = [];
    };
    steps.forEach((step, i) => {
      if (step.kind === 'rest') return flush();
      if (row.length >= maxCols) flush();
      row.push(i);
    });
    flush();
    return rows;
  }

  // Frames for an animation of a stepped timeline (Translator.createTimeline with stepped: true).
  // Each frame says where to sample the timeline (atMs) and how long to show it (durationMs).
  // The first letter starts at once, so the first frame is a handshape and not an empty gap.
  // A movement letter is split into equal frames so that its movement is visible.
  // The animation ends with an empty pause before it starts again.
  function animationFrames(tl, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const frames = [];
    tl.steps.forEach((step, i) => {
      const start = tl.starts[i];
      if (i > 0 && step.move > 0) {
        frames.push({ index: i, phase: 'gap', atMs: start, durationMs: step.move / o.speed });
      }
      const holdAt = start + step.move;
      if (step.kind === 'sign' && step.motion) {
        const count = Math.max(1, Math.round(step.hold / o.motionFrameMs));
        const each = step.hold / count;
        for (let k = 0; k < count; k++) {
          frames.push({ index: i, phase: 'hold', atMs: holdAt + k * each, durationMs: each / o.speed });
        }
      } else {
        frames.push({ index: i, phase: 'hold', atMs: holdAt, durationMs: step.hold / o.speed });
      }
    });
    if (frames.length) {
      frames.push({ index: tl.steps.length - 1, phase: 'end', atMs: tl.total, durationMs: o.endPauseMs });
    }
    return frames;
  }

  // A short ASCII file name for the text: "Grüße aus Köln" -> "gruesse-aus-koeln".
  function fileSlug(text) {
    const slug = String(text)
      .normalize('NFC')
      .toLocaleLowerCase('de-DE')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '');
    return slug || 'fingeralphabet';
  }

  return { sheetRows, animationFrames, fileSlug };
});
