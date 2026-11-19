/*
 * A small animated GIF (GIF89a) encoder for the fingerspelling animation.
 *
 * All frames share one palette of at most 256 colours. Colours are grouped into 5-bit-per-channel
 * buckets; the most frequent buckets become the palette and every other bucket uses its nearest
 * palette colour. That suits the flat drawings of this app. Frames are LZW-compressed, and a
 * NETSCAPE2.0 block makes the animation loop. Alpha is ignored: draw on an opaque background.
 *
 * Streaming use, which keeps only one frame in memory at a time:
 *   const palette = Gif.createPalette(); palette.add(rgba) for every frame; const p = palette.build();
 *   const writer = Gif.createWriter({ width, height, palette: p }); writer.addFrame(rgba, ms) ...;
 *   const bytes = writer.finish();
 * Or all at once: Gif.encodeGif({ width, height, frames: [{ rgba, delayMs }] }).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SignBridge = root.SignBridge || {}).Gif = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_COLORS = 256;
  const BUCKETS = 1 << 15;
  const MIN_DELAY_CS = 2; // browsers show a delay of 0 or 1 hundredths as 100 ms
  const MAX_DELAY_CS = 65535;
  const MAX_CODE = 4096;

  const bucketOf = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

  // ---- Palette ----

  function createPalette() {
    const count = new Float64Array(BUCKETS);
    const sumR = new Float64Array(BUCKETS);
    const sumG = new Float64Array(BUCKETS);
    const sumB = new Float64Array(BUCKETS);

    function add(rgba) {
      for (let i = 0; i < rgba.length; i += 4) {
        const k = bucketOf(rgba[i], rgba[i + 1], rgba[i + 2]);
        count[k] += 1;
        sumR[k] += rgba[i];
        sumG[k] += rgba[i + 1];
        sumB[k] += rgba[i + 2];
      }
    }

    const mean = (k) => [sumR[k] / count[k], sumG[k] / count[k], sumB[k] / count[k]];

    // A box of colour buckets for median cut, with its pixel weight and widest channel.
    function makeBox(items) {
      let weight = 0;
      const lo = [255, 255, 255];
      const hi = [0, 0, 0];
      for (const k of items) {
        weight += count[k];
        const c = mean(k);
        for (let ch = 0; ch < 3; ch++) {
          lo[ch] = Math.min(lo[ch], c[ch]);
          hi[ch] = Math.max(hi[ch], c[ch]);
        }
      }
      const ranges = [0, 1, 2].map((ch) => hi[ch] - lo[ch]);
      const axis = ranges.indexOf(Math.max(...ranges));
      return { items, weight, range: ranges[axis], axis };
    }

    // Splits a box at the weighted median of its widest channel.
    function splitBox(box) {
      const items = box.items.slice().sort((a, b) => mean(a)[box.axis] - mean(b)[box.axis]);
      let acc = 0;
      let cut = 1;
      for (let i = 0; i < items.length - 1; i++) {
        acc += count[items[i]];
        cut = i + 1;
        if (acc >= box.weight / 2) break;
      }
      return [makeBox(items.slice(0, cut)), makeBox(items.slice(cut))];
    }

    function nearest(colors, c) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < colors.length; i++) {
        const d = (c[0] - colors[i][0]) ** 2 + (c[1] - colors[i][1]) ** 2 + (c[2] - colors[i][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }

    function build() {
      const used = [];
      for (let k = 0; k < BUCKETS; k++) if (count[k] > 0) used.push(k);
      const map = new Uint8Array(BUCKETS);
      if (used.length <= MAX_COLORS) {
        // Few colours (the usual case for these drawings): every colour is kept exactly.
        const colors = used.map((k) => mean(k).map(Math.round));
        used.forEach((k, i) => (map[k] = i));
        if (colors.length === 0) colors.push([0, 0, 0]);
        return { colors, map };
      }
      // Median cut: split the heaviest, widest box until there are 256 boxes.
      const boxes = [makeBox(used)];
      while (boxes.length < MAX_COLORS) {
        let pick = -1;
        let score = 0;
        boxes.forEach((b, i) => {
          if (b.items.length > 1 && b.weight * b.range > score) {
            score = b.weight * b.range;
            pick = i;
          }
        });
        if (pick < 0) break;
        boxes.splice(pick, 1, ...splitBox(boxes[pick]));
      }
      const colors = boxes.map((b) => {
        const sum = [0, 0, 0];
        for (const k of b.items) {
          sum[0] += sumR[k];
          sum[1] += sumG[k];
          sum[2] += sumB[k];
        }
        return sum.map((s) => Math.round(s / b.weight));
      });
      for (const k of used) map[k] = nearest(colors, mean(k));
      return { colors, map };
    }

    return { add, build };
  }

  function indexPixels(rgba, palette) {
    const out = new Uint8Array(rgba.length / 4);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = palette.map[bucketOf(rgba[i], rgba[i + 1], rgba[i + 2])];
    return out;
  }

  // Palette and palette indices for a list of RGBA frames.
  function quantize(frames) {
    const palette = createPalette();
    frames.forEach((rgba) => palette.add(rgba));
    const built = palette.build();
    return { palette: built.colors, indexed: frames.map((rgba) => indexPixels(rgba, built)) };
  }

  // ---- Delays ----

  // Rounds frame delays (ms) to hundredths of a second so that the rounding errors do not add up.
  function centiseconds(delaysMs) {
    const out = [];
    let elapsed = 0;
    let shown = 0;
    for (const ms of delaysMs) {
      elapsed += ms;
      const cs = Math.min(MAX_DELAY_CS, Math.max(MIN_DELAY_CS, Math.round(elapsed / 10) - shown));
      out.push(cs);
      shown += cs;
    }
    return out;
  }

  // ---- Bytes ----

  function createBytes() {
    let buf = new Uint8Array(1 << 16);
    let len = 0;
    const ensure = (n) => {
      if (len + n <= buf.length) return;
      let size = buf.length * 2;
      while (size < len + n) size *= 2;
      const bigger = new Uint8Array(size);
      bigger.set(buf.subarray(0, len));
      buf = bigger;
    };
    return {
      u8(v) {
        ensure(1);
        buf[len++] = v & 0xff;
      },
      u16(v) {
        this.u8(v);
        this.u8(v >> 8);
      },
      ascii(s) {
        for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
      },
      bytes(arr) {
        ensure(arr.length);
        buf.set(arr, len);
        len += arr.length;
      },
      result: () => buf.slice(0, len),
    };
  }

  // ---- LZW ----

  function lzw(indices, minCodeSize) {
    const out = createBytes();
    const clear = 1 << minCodeSize;
    const eoi = clear + 1;
    let next = eoi + 1;
    let size = minCodeSize + 1;
    let dict = new Map();
    let bits = 0;
    let bitLen = 0;
    const emit = (code) => {
      bits |= code << bitLen;
      bitLen += size;
      while (bitLen >= 8) {
        out.u8(bits & 0xff);
        bits >>>= 8;
        bitLen -= 8;
      }
    };

    emit(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const code = dict.get(key);
      if (code !== undefined) {
        prefix = code;
        continue;
      }
      emit(prefix);
      if (next === MAX_CODE) {
        // The code table is full: start over.
        emit(clear);
        dict = new Map();
        next = eoi + 1;
        size = minCodeSize + 1;
      } else {
        if (next >= 1 << size) size += 1;
        dict.set(key, next++);
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (bitLen > 0) out.u8(bits & 0xff);
    return out.result();
  }

  // ---- Writer ----

  function createWriter(options) {
    const width = options.width;
    const height = options.height;
    const palette = options.palette;
    const loop = options.loop == null ? 0 : options.loop;
    if (!(width > 0 && height > 0 && width <= 65535 && height <= 65535)) throw new RangeError('Bad GIF size');
    const tableBits = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.colors.length))));
    const minCodeSize = Math.max(2, tableBits);
    const out = createBytes();
    let elapsedMs = 0;
    let shownCs = 0;
    let frames = 0;

    out.ascii('GIF89a');
    out.u16(width);
    out.u16(height);
    out.u8(0x80 | 0x70 | (tableBits - 1)); // global colour table, 8-bit colour resolution
    out.u8(0); // background colour index
    out.u8(0); // pixel aspect ratio
    for (let i = 0; i < 1 << tableBits; i++) {
      const c = palette.colors[i] || [0, 0, 0];
      out.u8(c[0]);
      out.u8(c[1]);
      out.u8(c[2]);
    }
    // NETSCAPE2.0 application extension: loop count (0 = forever).
    out.u8(0x21);
    out.u8(0xff);
    out.u8(11);
    out.ascii('NETSCAPE2.0');
    out.u8(3);
    out.u8(1);
    out.u16(loop);
    out.u8(0);

    function addFrame(rgba, delayMs) {
      if (!rgba || rgba.length !== width * height * 4) throw new RangeError('Frame size does not match the GIF size');
      elapsedMs += delayMs;
      const cs = Math.min(MAX_DELAY_CS, Math.max(MIN_DELAY_CS, Math.round(elapsedMs / 10) - shownCs));
      shownCs += cs;
      // Graphic control extension: keep the frame in place, no transparency.
      out.u8(0x21);
      out.u8(0xf9);
      out.u8(4);
      out.u8(0x04);
      out.u16(cs);
      out.u8(0);
      out.u8(0);
      // Image descriptor: the whole canvas, no local colour table, not interlaced.
      out.u8(0x2c);
      out.u16(0);
      out.u16(0);
      out.u16(width);
      out.u16(height);
      out.u8(0);
      out.u8(minCodeSize);
      const data = lzw(indexPixels(rgba, palette), minCodeSize);
      for (let p = 0; p < data.length; p += 255) {
        const n = Math.min(255, data.length - p);
        out.u8(n);
        out.bytes(data.subarray(p, p + n));
      }
      out.u8(0);
      frames += 1;
    }

    function finish() {
      if (frames === 0) throw new RangeError('A GIF needs at least one frame');
      out.u8(0x3b);
      return out.result();
    }

    return { addFrame, finish };
  }

  function encodeGif(options) {
    const frames = options.frames || [];
    if (frames.length === 0) throw new RangeError('A GIF needs at least one frame');
    for (const f of frames) {
      if (!f.rgba || f.rgba.length !== options.width * options.height * 4) {
        throw new RangeError('Frame size does not match the GIF size');
      }
    }
    const palette = createPalette();
    frames.forEach((f) => palette.add(f.rgba));
    const writer = createWriter({ width: options.width, height: options.height, palette: palette.build(), loop: options.loop });
    frames.forEach((f) => writer.addFrame(f.rgba, f.delayMs));
    return writer.finish();
  }

  return { createPalette, createWriter, encodeGif, quantize, centiseconds };
});
