/*
 * SignBridge hand model.
 *
 * A pose is a few joint angles in degrees (see NEUTRAL_POSE). modelLandmarks()
 * turns a pose into 21 points in MediaPipe's landmark order, in model space:
 * x to the right, y up, z toward the viewer, hand length about 2 units.
 *
 * features() works on MediaPipe-style points (y down, z negative toward the
 * camera). Its values do not change when the hand is moved, rotated, scaled or
 * mirrored, so a drawn pose and a webcam hand can be compared directly.
 * featureVector() divides each feature by FEATURE_SCALES so that one unit is
 * roughly a visible difference between handshapes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SignBridge = root.SignBridge || {};
    root.SignBridge.Hand = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEG = Math.PI / 180;
  const FINGERS = ['index', 'middle', 'ring', 'pinky'];

  // Knuckle positions in hand units. The thumb entry is its base (CMC).
  const BASE = {
    thumb: [-0.42, 0.28, 0.1],
    index: [-0.36, 0.95, 0],
    middle: [-0.1, 1.0, 0],
    ring: [0.15, 0.96, 0],
    pinky: [0.36, 0.86, 0],
  };

  // Bone lengths, from the knuckle outward.
  const BONES = {
    thumb: [0.3, 0.26, 0.22],
    index: [0.4, 0.25, 0.2],
    middle: [0.44, 0.27, 0.22],
    ring: [0.41, 0.25, 0.2],
    pinky: [0.32, 0.2, 0.17],
  };

  // MediaPipe landmark indices of each chain: base, joint, joint, tip.
  const CHAINS = {
    thumb: [1, 2, 3, 4],
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    pinky: [17, 18, 19, 20],
  };

  // Open, relaxed hand. psi = sideways spread, mcp/pip/dip = bend in degrees.
  // Thumb: mcp bends its first bone, ip adds a bend at its joint, tip adds one at the tip.
  const NEUTRAL_POSE = {
    roll: 0,
    pitch: 0,
    index: { psi: -6, mcp: 0, pip: 0, dip: 0 },
    middle: { psi: 0, mcp: 0, pip: 0, dip: 0 },
    ring: { psi: 5, mcp: 0, pip: 0, dip: 0 },
    pinky: { psi: 12, mcp: 0, pip: 0, dip: 0 },
    thumb: { psi: -40, mcp: 0, ip: 0, tip: 0 },
  };

  const FEATURE_NAMES = [
    'index.mcp', 'index.pip', 'index.dip', 'index.ext',
    'middle.mcp', 'middle.pip', 'middle.dip', 'middle.ext',
    'ring.mcp', 'ring.pip', 'ring.dip', 'ring.ext',
    'pinky.mcp', 'pinky.pip', 'pinky.dip', 'pinky.ext',
    'gap.index-middle', 'gap.middle-ring', 'gap.ring-pinky',
    'thumb.base', 'thumb.mcp', 'thumb.ip',
    'thumb-tip.index-tip', 'thumb-tip.middle-tip', 'thumb-tip.ring-tip', 'thumb-tip.pinky-tip',
    'thumb-tip.index-pip', 'thumb-tip.index-mcp', 'thumb-tip.wrist',
    'orient.fingers-y', 'orient.palm-facing',
  ];

  // Angles are in radians; distances are fractions of the hand size.
  function scaleFor(name) {
    if (name.startsWith('gap.') || name.startsWith('thumb-tip.')) return 0.15;
    if (name.startsWith('orient.')) return 0.25;
    if (name.endsWith('.ext')) return 0.3;
    return 0.5; // bend angles and thumb angles
  }
  const FEATURE_SCALES = FEATURE_NAMES.map(scaleFor);

  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const lerp = (a, b, t) => a + (b - a) * t;

  function fillJoints(src, defaults) {
    const out = {};
    for (const k of Object.keys(defaults)) out[k] = num(src && src[k], defaults[k]);
    return out;
  }

  function normalizePose(partial) {
    const p = partial || {};
    const out = { roll: num(p.roll, 0), pitch: num(p.pitch, 0) };
    for (const f of FINGERS) out[f] = fillJoints(p[f], NEUTRAL_POSE[f]);
    out.thumb = fillJoints(p.thumb, NEUTRAL_POSE.thumb);
    return out;
  }

  function lerpPose(a, b, t) {
    const out = { roll: lerp(a.roll, b.roll, t), pitch: lerp(a.pitch, b.pitch, t) };
    for (const f of [...FINGERS, 'thumb']) {
      out[f] = {};
      for (const k of Object.keys(NEUTRAL_POSE[f])) out[f][k] = lerp(a[f][k], b[f][k], t);
    }
    return out;
  }

  // Deterministic random numbers in [0, 1) (mulberry32).
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rng) {
    let u = 0;
    while (u === 0) u = rng();
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Returns a copy of the pose with every joint shifted by about sigmaDeg degrees.
  function perturbPose(pose, rng, sigmaDeg) {
    const p = normalizePose(pose);
    const jitter = (v) => v + gaussian(rng) * sigmaDeg;
    p.roll = jitter(p.roll);
    p.pitch = jitter(p.pitch);
    for (const f of [...FINGERS, 'thumb']) {
      for (const k of Object.keys(p[f])) p[f][k] = jitter(p[f][k]);
    }
    return p;
  }

  // Unit direction of one bone: psi = sideways spread, phi = bend from "up" toward the viewer.
  function boneDirection(psiDeg, phiDeg) {
    const psi = psiDeg * DEG;
    const phi = phiDeg * DEG;
    return [Math.sin(psi) * Math.cos(phi), Math.cos(psi) * Math.cos(phi), Math.sin(phi)];
  }

  // Joint positions of one chain. flex[i] is the cumulative bend of bone i, in degrees.
  function chainPoints(base, lengths, flex, psi) {
    const pts = [base];
    let cur = base;
    for (let i = 0; i < lengths.length; i++) {
      const d = boneDirection(psi, flex[i]);
      cur = [cur[0] + lengths[i] * d[0], cur[1] + lengths[i] * d[1], cur[2] + lengths[i] * d[2]];
      pts.push(cur);
    }
    return pts;
  }

  function rotatePoint(p, rollDeg, pitchDeg) {
    const r = rollDeg * DEG;
    const q = pitchDeg * DEG;
    const x1 = p[0] * Math.cos(r) - p[1] * Math.sin(r);
    const y1 = p[0] * Math.sin(r) + p[1] * Math.cos(r);
    const z1 = p[2];
    return [x1, y1 * Math.cos(q) - z1 * Math.sin(q), y1 * Math.sin(q) + z1 * Math.cos(q)];
  }

  // 21 landmarks in model space (x right, y up, z toward the viewer).
  function modelLandmarks(pose) {
    const p = normalizePose(pose);
    const pts = new Array(21);
    pts[0] = [0, 0, 0];

    const t = p.thumb;
    const thumbPts = chainPoints(BASE.thumb, BONES.thumb, [t.mcp, t.mcp + t.ip, t.mcp + t.ip + t.tip], t.psi);
    for (let i = 0; i < 4; i++) pts[1 + i] = thumbPts[i];

    FINGERS.forEach((name, k) => {
      const f = p[name];
      const flex = [f.mcp, f.mcp + f.pip, f.mcp + f.pip + f.dip];
      const fp = chainPoints(BASE[name], BONES[name], flex, f.psi);
      for (let i = 0; i < 4; i++) pts[5 + 4 * k + i] = fp[i];
    });

    return pts.map((q) => rotatePoint(q, p.roll, p.pitch));
  }

  // Model space to MediaPipe image convention (y down, z negative toward the camera).
  function toMediaPipe(points) {
    return points.map((p) => ({ x: p[0], y: -p[1], z: -p[2] }));
  }

  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = (a) => Math.sqrt(dot(a, a));
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const unit = (a) => {
    const l = len(a) || 1e-12;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  // Angle between two vectors. atan2 keeps small angles accurate, where acos loses precision.
  const angle = (a, b) => Math.atan2(len(cross(a, b)), dot(a, b));
  // Raw, unscaled features of 21 MediaPipe-style landmarks (isotropic coordinates).
  // Only angles between bones and distances between landmarks are used. Spreads are
  // fingertip gaps rather than angles, because a curled finger has no reliable
  // direction across the palm.
  function features(lm) {
    const P = (i) => lm[i];
    const W = P(0);
    const n = unit(cross(sub(P(5), W), sub(P(17), W))); // palm normal
    const S = len(sub(P(9), W)) || 1e-12; // hand size: wrist to middle knuckle
    const out = [];

    for (const [m, p, d, t] of [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
      const knuckle = sub(P(m), W);
      const b1 = sub(P(p), P(m));
      const b2 = sub(P(d), P(p));
      const b3 = sub(P(t), P(d));
      out.push(angle(knuckle, b1), angle(b1, b2), angle(b2, b3), len(sub(P(t), W)) / (len(knuckle) || 1e-12));
    }

    for (const [a, b] of [[8, 12], [12, 16], [16, 20]]) out.push(len(sub(P(a), P(b))) / S);

    const u1 = sub(P(2), P(1));
    const u2 = sub(P(3), P(2));
    const u3 = sub(P(4), P(3));
    out.push(angle(sub(P(1), W), u1), angle(u1, u2), angle(u2, u3));

    for (const j of [8, 12, 16, 20, 6, 5]) out.push(len(sub(P(4), P(j))) / S);
    out.push(len(sub(P(4), W)) / S);

    const up = unit(sub(P(9), W));
    out.push(up.y, Math.abs(n.z));
    return out;
  }

  function featureVector(lm) {
    return features(lm).map((v, i) => v / FEATURE_SCALES[i]);
  }

  // Features for normalised MediaPipe landmarks (x and y in 0..1 of the frame).
  function featuresFromLandmarks(lm, width, height) {
    return featureVector(lm.map((p) => ({ x: p.x * width, y: p.y * height, z: p.z * width })));
  }

  function poseFeatures(pose) {
    return featureVector(toMediaPipe(modelLandmarks(pose)));
  }

  return {
    FINGERS,
    CHAINS,
    NEUTRAL_POSE,
    FEATURE_NAMES,
    FEATURE_SCALES,
    normalizePose,
    lerpPose,
    perturbPose,
    makeRng,
    modelLandmarks,
    toMediaPipe,
    features,
    featureVector,
    featuresFromLandmarks,
    poseFeatures,
  };
});
