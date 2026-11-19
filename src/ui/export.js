/*
 * Saves the Buchstabieren sequence as a picture (PNG: every handshape with its letter, one row per
 * word) or as an animation (GIF: one handshape after another, with the same empty gaps as the
 * player and no generated in-between poses). Both carry the notice that fingerspelling is not a
 * DGS translation. Everything is drawn and encoded in this browser; nothing is uploaded.
 */
(function () {
  'use strict';

  const SB = window.SignBridge;
  const App = SB.App;
  const Hand = SB.Hand;
  const Renderer = SB.Renderer;
  const Translator = SB.Translator;
  const Exporter = SB.Exporter;
  const Gif = SB.Gif;

  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const PAPER = '#ffffff';
  const INK = '#1c2330';
  const MUTED = '#5b6474';
  const BORDER = '#d6d0c4';
  const WARN = '#b42318';

  const SHEET = { cell: 200, label: 76, gap: 18, pad: 36, header: 96, footer: 44, maxCols: 6, scale: 2 };
  const ANIM = { width: 360, height: 480, hand: 300, handTop: 72 };
  const MAX_ANIM_FRAMES = 1500;

  const $ = (id) => document.getElementById(id);
  const el = { png: $('savePngBtn'), gif: $('saveGifBtn'), progress: $('exportProgress'), status: $('exportStatus') };
  let busy = false;

  function handCanvas(size, pose, offset) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    Renderer.drawHand(c.getContext('2d'), size, size, Hand.modelLandmarks(pose), { offset });
    return c;
  }

  function roundedBox(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function write(ctx, s, x, y, o) {
    ctx.font = (o.weight || 400) + ' ' + o.size + 'px ' + FONT;
    ctx.fillStyle = o.color || INK;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = 'top';
    if (o.maxWidth) ctx.fillText(s, x, y, o.maxWidth);
    else ctx.fillText(s, x, y);
  }

  const tagFor = (step) =>
    step.kind === 'unsupported' ? App.t('unsupportedTag') : step.motion ? App.t('motionTag') : '';

  // ---- Picture (PNG) ----

  function drawSheet(sp) {
    const S = SHEET;
    const tl = sp.timeline;
    const rows = Exporter.sheetRows(tl.steps, S.maxCols);
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const width = Math.max(520, S.pad * 2 + cols * S.cell + (cols - 1) * S.gap);
    const height = S.pad * 2 + S.header + rows.length * (S.cell + S.label) + Math.max(0, rows.length - 1) * S.gap + S.footer;
    const canvas = document.createElement('canvas');
    canvas.width = width * S.scale;
    canvas.height = height * S.scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(S.scale, S.scale);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);

    const inner = width - 2 * S.pad;
    write(ctx, sp.text, S.pad, S.pad, { size: 34, weight: 700, maxWidth: inner });
    write(ctx, App.t('exportNotice'), S.pad, S.pad + 50, { size: 18, color: MUTED, maxWidth: inner });

    rows.forEach((row, r) => {
      const y = S.pad + S.header + r * (S.cell + S.label + S.gap);
      row.forEach((index, c) => {
        const step = tl.steps[index];
        const x = S.pad + c * (S.cell + S.gap);
        const unsupported = step.kind === 'unsupported';
        roundedBox(ctx, x, y, S.cell, S.cell, 16);
        ctx.lineWidth = 2;
        ctx.strokeStyle = unsupported ? WARN : BORDER;
        ctx.setLineDash(unsupported ? [8, 6] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        if (step.pose) ctx.drawImage(handCanvas(S.cell * S.scale, step.pose), x, y, S.cell, S.cell);
        else write(ctx, '?', x + S.cell / 2, y + S.cell / 2 - 46, { size: 88, weight: 700, color: WARN, align: 'center' });
        write(ctx, step.label, x + S.cell / 2, y + S.cell + 10, {
          size: 34, weight: 700, color: unsupported ? WARN : INK, align: 'center', maxWidth: S.cell,
        });
        const tag = tagFor(step);
        if (tag) write(ctx, tag, x + S.cell / 2, y + S.cell + 52, { size: 15, color: MUTED, align: 'center', maxWidth: S.cell });
      });
    });

    write(ctx, App.t('exportFooter'), S.pad, height - S.pad - 18, { size: 15, color: MUTED, maxWidth: inner });
    return canvas;
  }

  function toBlob(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))), type);
    });
  }

  function makePng(sp) {
    return toBlob(drawSheet(sp), 'image/png');
  }

  // ---- Animation (GIF) ----

  // Draws one animation frame: the text and the notice on top, the handshape, then its letter.
  function drawFrame(ctx, sp, frame) {
    const A = ANIM;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, A.width, A.height);
    write(ctx, sp.text, A.width / 2, 14, { size: 22, weight: 700, align: 'center', maxWidth: A.width - 24 });
    write(ctx, App.t('exportNotice'), A.width / 2, 46, { size: 13, color: MUTED, align: 'center', maxWidth: A.width - 24 });
    if (frame.phase === 'end') return; // empty pause before the animation starts again

    const s = Translator.sampleTimeline(sp.timeline, frame.atMs);
    if (s.pose) ctx.drawImage(handCanvas(A.hand, s.pose, s.offset), (A.width - A.hand) / 2, A.handTop);
    if (s.phase === 'gap' || s.step.kind === 'rest') return;
    const unsupported = s.step.kind === 'unsupported';
    const y = A.handTop + A.hand + 8;
    write(ctx, unsupported ? '? ' + s.step.label : s.step.label, A.width / 2, y, {
      size: 56, weight: 700, color: unsupported ? WARN : INK, align: 'center', maxWidth: A.width - 24,
    });
    const tag = tagFor(s.step);
    if (tag) write(ctx, tag, A.width / 2, y + 66, { size: 14, color: MUTED, align: 'center', maxWidth: A.width - 24 });
  }

  // Lets the page repaint between frames. Unlike timers, a MessageChannel is not slowed down in
  // background tabs.
  function nextTask() {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(0);
    });
  }

  // Two passes keep only one frame in memory: the first collects the colours, the second encodes.
  async function makeGif(sp, onProgress) {
    const frames = Exporter.animationFrames(sp.timeline, { speed: sp.speed });
    if (frames.length > MAX_ANIM_FRAMES) throw new RangeError('Too many frames for one animation');
    const canvas = document.createElement('canvas');
    canvas.width = ANIM.width;
    canvas.height = ANIM.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = () => ctx.getImageData(0, 0, ANIM.width, ANIM.height).data;
    const progress = onProgress || (() => {});
    const total = frames.length * 2;
    let done = 0;

    const palette = Gif.createPalette();
    for (const frame of frames) {
      drawFrame(ctx, sp, frame);
      palette.add(pixels());
      progress(++done / total);
      await nextTask();
    }
    const writer = Gif.createWriter({ width: ANIM.width, height: ANIM.height, palette: palette.build() });
    for (const frame of frames) {
      drawFrame(ctx, sp, frame);
      writer.addFrame(pixels(), frame.durationMs);
      progress(++done / total);
      await nextTask();
    }
    return new Blob([writer.finish()], { type: 'image/gif' });
  }

  // ---- Saving ----

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function setBusy(on) {
    busy = on;
    el.png.disabled = on;
    el.gif.disabled = on;
    el.progress.hidden = !on;
    el.progress.value = 0;
  }

  async function save(kind) {
    if (busy) return;
    const sp = App.spelling();
    if (!sp) {
      App.setStatus(el.status, 'nothingToPlay');
      return;
    }
    const name = 'fingeralphabet-' + Exporter.fileSlug(sp.text) + (kind === 'png' ? '.png' : '.gif');
    setBusy(true);
    App.setStatus(el.status, 'exportWorking');
    try {
      const blob = kind === 'png' ? await makePng(sp) : await makeGif(sp, (p) => (el.progress.value = p));
      api.save(blob, name);
      App.setStatus(el.status, 'exportDone', { name });
    } catch (err) {
      App.setStatus(el.status, err instanceof RangeError ? 'exportTooLong' : 'exportFailed');
    } finally {
      setBusy(false);
    }
  }

  el.png.addEventListener('click', () => save('png'));
  el.gif.addEventListener('click', () => save('gif'));

  // save() hands the finished file to the browser; it is a property so that it can be replaced.
  const api = { makePng, makeGif, save: download };
  SB.Export = api;
})();
