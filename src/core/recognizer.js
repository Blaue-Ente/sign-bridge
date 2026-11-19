/*
 * Recognition of handshapes from hand features.
 *
 * createClassifier() returns the nearest prototype. Prototypes are default
 * templates from the handshape library, plus the user's calibration samples,
 * which replace the defaults for a shape once there are enough of them.
 * createStabilizer() turns the per-frame stream into single letters.
 * createCalibrationStore() keeps the user's samples on this device.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && !!module.exports;
  const ns = isNode ? null : root.SignBridge;
  const api = factory(isNode ? require('./hand.js') : ns.Hand);
  if (isNode) module.exports = api;
  else ns.Recognizer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Hand) {
  'use strict';

  // Scaled feature units. Own-shape distances in the self-test stay below ~2.2 and an open
  // hand is about 6 away, so 3.0 accepts clean letters and still rejects a relaxed hand.
  const DEFAULT_THRESHOLD = 3.0;
  const DEFAULT_STORAGE_KEY = 'signbridge.calibration.v1';

  function distance(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }

  // Default templates: the shape itself plus randomly perturbed variants.
  function buildPrototypes(options) {
    const shapes = options.shapes;
    const poseFor = options.poseFor;
    const featuresFor = options.featuresFor;
    const rng = options.rng;
    const variants = options.variants == null ? 7 : options.variants;
    const sigmaDeg = options.sigmaDeg == null ? 4 : options.sigmaDeg;
    const out = {};
    for (const name of shapes) {
      const base = poseFor(name);
      const list = [featuresFor(base)];
      for (let i = 1; i < variants; i++) list.push(featuresFor(Hand.perturbPose(base, rng, sigmaDeg)));
      out[name] = list;
    }
    return out;
  }

  // Calibration replaces a shape's defaults once it has minSamples; before that, both are used.
  function mergePrototypes(defaults, calibrated, minSamples) {
    const need = minSamples == null ? 5 : minSamples;
    const out = {};
    const names = new Set([...Object.keys(defaults), ...Object.keys(calibrated)]);
    for (const name of names) {
      const cal = calibrated[name] || [];
      const def = defaults[name] || [];
      out[name] = cal.length >= need ? cal.map((v) => v.slice()) : def.concat(cal);
    }
    return out;
  }

  function createClassifier(options) {
    const prototypes = options.prototypes;
    const threshold = options.threshold == null ? DEFAULT_THRESHOLD : options.threshold;
    const names = Object.keys(prototypes).filter((n) => prototypes[n] && prototypes[n].length > 0);
    return {
      threshold,
      classify(vec) {
        let best = null;
        for (const name of names) {
          for (const proto of prototypes[name]) {
            const d = distance(vec, proto);
            if (best === null || d < best.distance) best = { shape: name, distance: d };
          }
        }
        if (best === null) return null;
        return { shape: best.shape, distance: best.distance, accepted: best.distance <= threshold };
      },
    };
  }

  // Emits a shape once it wins required of the last windowSize frames.
  // The same shape is not emitted again until the hand has been away for releaseMs.
  function createStabilizer(options) {
    const opts = Object.assign({ windowSize: 8, required: 6, releaseMs: 500 }, options || {});
    let recent = [];
    let lastEmitted = null;
    let releasedAt = null;
    return {
      push(shape, timeMs) {
        if (shape == null) {
          if (releasedAt === null) releasedAt = timeMs;
          if (timeMs - releasedAt >= opts.releaseMs) lastEmitted = null;
          recent.push(null);
        } else {
          releasedAt = null;
          recent.push(shape);
        }
        if (recent.length > opts.windowSize) recent = recent.slice(-opts.windowSize);
        if (shape == null) return null;

        const votes = new Map();
        for (const s of recent) if (s != null) votes.set(s, (votes.get(s) || 0) + 1);
        let best = null;
        let bestVotes = 0;
        for (const [s, n] of votes) {
          if (n > bestVotes) {
            best = s;
            bestVotes = n;
          }
        }
        if (best !== null && bestVotes >= opts.required && best !== lastEmitted) {
          lastEmitted = best;
          recent = [];
          return best;
        }
        return null;
      },
      reset() {
        recent = [];
        lastEmitted = null;
        releasedAt = null;
      },
    };
  }

  // Calibration samples per shape, kept in storage. Storage failures are tolerated:
  // samples then live only in memory for this page.
  function createCalibrationStore(storage, key, maxPerShape) {
    const storageKey = key || DEFAULT_STORAGE_KEY;
    const cap = maxPerShape == null ? 30 : maxPerShape;
    let data = readAll();

    function readAll() {
      try {
        const raw = storage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        const samples = parsed && parsed.samples && typeof parsed.samples === 'object' ? parsed.samples : {};
        const out = {};
        for (const shape of Object.keys(samples)) {
          if (!Array.isArray(samples[shape])) continue;
          out[shape] = samples[shape].filter((v) => Array.isArray(v) && v.every((x) => Number.isFinite(x)));
        }
        return out;
      } catch (e) {
        return {};
      }
    }

    function writeAll() {
      try {
        storage.setItem(storageKey, JSON.stringify({ version: 1, samples: data }));
      } catch (e) {
        // Keep working from memory.
      }
    }

    return {
      add(shape, vec) {
        const list = (data[shape] || []).concat([Array.from(vec)]);
        data[shape] = list.slice(-cap);
        writeAll();
        return data[shape].length;
      },
      samples(shape) {
        return (data[shape] || []).map((v) => v.slice());
      },
      all() {
        const out = {};
        for (const shape of Object.keys(data)) out[shape] = data[shape].map((v) => v.slice());
        return out;
      },
      clear(shape) {
        if (shape === undefined) data = {};
        else delete data[shape];
        writeAll();
      },
    };
  }

  return {
    DEFAULT_THRESHOLD,
    DEFAULT_STORAGE_KEY,
    distance,
    buildPrototypes,
    mergePrototypes,
    createClassifier,
    createStabilizer,
    createCalibrationStore,
  };
});
