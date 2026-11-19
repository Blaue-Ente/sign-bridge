'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Gif = require('../src/core/gif.js');

// ---- A small GIF reader for the tests: walks the blocks and decodes the LZW image data. ----

function lzwDecode(data, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let size = minCodeSize + 1;
  let next = eoi + 1;
  let dict = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict[i] = [i];
    size = minCodeSize + 1;
    next = eoi + 1;
  };
  reset();
  const out = [];
  let prev = null;
  let bits = 0;
  let bitLen = 0;
  let pos = 0;
  for (;;) {
    while (bitLen < size) {
      if (pos >= data.length) throw new Error('LZW data ended without an end code');
      bits |= data[pos++] << bitLen;
      bitLen += 8;
    }
    const code = bits & ((1 << size) - 1);
    bits >>>= size;
    bitLen -= size;
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry;
    if (code < next && dict[code]) entry = dict[code];
    else if (code === next && prev) entry = prev.concat(prev[0]);
    else throw new Error('Bad LZW code ' + code);
    for (const v of entry) out.push(v);
    if (prev && next < 4096) {
      dict[next++] = prev.concat(entry[0]);
      if (next === 1 << size && size < 12) size++;
    }
    prev = entry;
  }
  return out;
}

function readGif(bytes) {
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => {
    const v = bytes[p] | (bytes[p + 1] << 8);
    p += 2;
    return v;
  };
  const ascii = (n) => {
    const s = String.fromCharCode(...bytes.slice(p, p + n));
    p += n;
    return s;
  };
  const subBlocks = () => {
    const out = [];
    for (let n = u8(); n > 0; n = u8()) for (let i = 0; i < n; i++) out.push(u8());
    return out;
  };

  const gif = { header: ascii(6), width: u16(), height: u16(), palette: [], frames: [], loop: null };
  const packed = u8();
  u8(); // background colour index
  u8(); // pixel aspect ratio
  if (packed & 0x80) for (let i = 0, n = 2 << (packed & 7); i < n; i++) gif.palette.push([u8(), u8(), u8()]);
  let delay = null;
  for (;;) {
    const b = u8();
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        u8(); // block size
        u8(); // packed fields
        delay = u16();
        u8(); // transparent index
        u8(); // terminator
      } else if (label === 0xff) {
        const app = ascii(u8());
        const data = subBlocks();
        if (app === 'NETSCAPE2.0') gif.loop = data[1] | (data[2] << 8);
      } else {
        subBlocks();
      }
      continue;
    }
    if (b === 0x2c) {
      const frame = { left: u16(), top: u16(), width: u16(), height: u16(), delay };
      assert.equal(u8() & 0x80, 0, 'no local colour table');
      const minCodeSize = u8();
      frame.indices = lzwDecode(subBlocks(), minCodeSize);
      gif.frames.push(frame);
      delay = null;
      continue;
    }
    throw new Error('Unexpected block 0x' + b.toString(16) + ' at byte ' + (p - 1));
  }
  assert.equal(p, bytes.length, 'nothing after the trailer');
  return gif;
}

// ---- Test images ----

function image(width, height, colorAt) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function colorsOf(rgba) {
  const out = [];
  for (let i = 0; i < rgba.length; i += 4) out.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  return out;
}

const WHITE = [255, 255, 255];
const SKIN = [243, 201, 162];
const LINE = [91, 59, 36];

// ---- Tests ----

test('writes a looping GIF89a of the given size', () => {
  const gif = readGif(Gif.encodeGif({ width: 4, height: 3, frames: [{ rgba: image(4, 3, () => WHITE), delayMs: 500 }] }));
  assert.equal(gif.header, 'GIF89a');
  assert.equal(gif.width, 4);
  assert.equal(gif.height, 3);
  assert.equal(gif.loop, 0); // 0 = repeat forever
  assert.equal(gif.frames.length, 1);
  assert.deepEqual([gif.frames[0].width, gif.frames[0].height, gif.frames[0].delay], [4, 3, 50]);
});

test('an image with few colours decodes back to exactly the same colours', () => {
  const palette = [WHITE, SKIN, LINE];
  const rgba = image(5, 4, (x, y) => palette[(x + 2 * y) % 3]);
  const gif = readGif(Gif.encodeGif({ width: 5, height: 4, frames: [{ rgba, delayMs: 100 }] }));
  assert.deepEqual(gif.frames[0].indices.map((k) => gif.palette[k]), colorsOf(rgba));
});

test('stores one image per frame, each with its own delay', () => {
  const frames = [WHITE, SKIN, LINE].map((c) => ({ rgba: image(2, 2, () => c), delayMs: 300 }));
  const gif = readGif(Gif.encodeGif({ width: 2, height: 2, frames }));
  assert.equal(gif.frames.length, 3);
  assert.deepEqual(gif.frames.map((f) => gif.palette[f.indices[0]]), [WHITE, SKIN, LINE]);
  assert.deepEqual(gif.frames.map((f) => f.delay), [30, 30, 30]);
});

test('delays are rounded to hundredths of a second without drifting', () => {
  assert.deepEqual(Gif.centiseconds([180, 650, 655]), [18, 65, 66]);
  assert.deepEqual(Gif.centiseconds([90.5, 90.5, 90.5, 90.5]), [9, 9, 9, 9]);
});

test('very short frames get at least 20 ms, which browsers honour', () => {
  assert.deepEqual(Gif.centiseconds([5]), [2]);
});

test('large busy images survive code-size growth and dictionary resets', () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const colors = Array.from({ length: 200 }, (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 13) % 256]);
  const rgba = image(128, 128, () => colors[Math.floor(rand() * colors.length)]);
  const q = Gif.quantize([rgba]);
  assert.ok(q.palette.length <= 256);
  const gif = readGif(Gif.encodeGif({ width: 128, height: 128, frames: [{ rgba, delayMs: 100 }] }));
  assert.deepEqual(gif.frames[0].indices, Array.from(q.indexed[0]));
});

test('more than 256 colours are reduced to at most 256, each pixel to a nearby colour', () => {
  const rgba = image(64, 64, (x, y) => [x * 4, y * 4, ((x + y) * 2) % 256]); // 4096 colours
  const q = Gif.quantize([rgba]);
  assert.ok(q.palette.length <= 256);
  const original = colorsOf(rgba);
  let worst = 0;
  q.indexed[0].forEach((k, i) => {
    const [r, g, b] = q.palette[k];
    const [R, G, B] = original[i];
    worst = Math.max(worst, Math.hypot(r - R, g - G, b - B));
  });
  assert.ok(worst < 64, 'worst colour error ' + worst.toFixed(1));
});

test('rejects frames whose size does not match the image', () => {
  assert.throws(() => Gif.encodeGif({ width: 2, height: 2, frames: [{ rgba: new Uint8ClampedArray(4), delayMs: 100 }] }), RangeError);
  assert.throws(() => Gif.encodeGif({ width: 2, height: 2, frames: [] }), RangeError);
});
