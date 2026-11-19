/*
 * Canvas drawing: the hand (from model landmarks) and the camera overlay (from MediaPipe landmarks).
 */
(function (root) {
  'use strict';

  const SB = (root.SignBridge = root.SignBridge || {});

  const SKIN = '#f3c9a2';
  const BACK = '#dcae88';
  const LINE = '#5b3b24';
  const FINGER_CHAINS = {
    thumb: [1, 2, 3, 4],
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    pinky: [17, 18, 19, 20],
  };
  const PALM = [0, 1, 5, 9, 13, 17];
  const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];

  const avg = (values) => values.reduce((a, b) => a + b, 0) / values.length;

  function strokeChain(ctx, pts, width) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = LINE;
    ctx.lineWidth = width + 4;
    ctx.stroke();
    ctx.strokeStyle = SKIN;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function drawPalm(ctx, P) {
    ctx.beginPath();
    PALM.forEach((i, k) => (k === 0 ? ctx.moveTo(P[i].x, P[i].y) : ctx.lineTo(P[i].x, P[i].y)));
    ctx.closePath();
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Draws 21 model landmarks (x right, y up, z toward the viewer), centred in the canvas.
  // Fingers that point away from the viewer are drawn behind the palm.
  function drawHand(ctx, w, h, points, opts) {
    const options = opts || {};
    ctx.clearRect(0, 0, w, h);

    const scale = Math.min(w, h) * 0.34;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    // Optional movement offset (model units). It is applied after centring, so the motion stays visible.
    const offset = options.offset || { x: 0, y: 0 };
    const cx = (minX + maxX) / 2 - offset.x;
    const cy = (minY + maxY) / 2 - offset.y;
    const P = points.map((p) => ({ x: w / 2 + (p[0] - cx) * scale, y: h / 2 - (p[1] - cy) * scale, z: p[2] }));
    const width = scale * 0.16;

    if (options.arm) {
      const half = scale * 0.2;
      ctx.beginPath();
      ctx.moveTo(P[0].x - half, P[0].y);
      ctx.lineTo(P[0].x - half * 1.1, h);
      ctx.lineTo(P[0].x + half * 1.1, h);
      ctx.lineTo(P[0].x + half, P[0].y);
      ctx.closePath();
      ctx.fillStyle = BACK;
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const palmZ = avg([P[0].z, P[5].z, P[9].z, P[13].z, P[17].z]);
    const chains = Object.keys(FINGER_CHAINS).map((name) => {
      const pts = FINGER_CHAINS[name].map((i) => P[i]);
      return { z: avg(pts.map((p) => p.z)), pts };
    });
    chains.filter((c) => c.z < palmZ).forEach((c) => strokeChain(ctx, c.pts, width));
    drawPalm(ctx, P);
    chains.filter((c) => c.z >= palmZ).forEach((c) => strokeChain(ctx, c.pts, width));
  }

  // Draws the camera landmarks (MediaPipe normalized coordinates) over the video.
  function drawLandmarks(ctx, w, h, landmarks) {
    ctx.clearRect(0, 0, w, h);
    if (!landmarks) return;
    ctx.lineWidth = Math.max(2, w / 160);
    ctx.strokeStyle = '#2dd4bf';
    for (const [a, b] of CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
      ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
      ctx.stroke();
    }
    ctx.fillStyle = '#f59e0b';
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, Math.max(3, w / 120), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  SB.Renderer = { drawHand, drawLandmarks, CONNECTIONS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
