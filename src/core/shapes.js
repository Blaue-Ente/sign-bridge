/*
 * Handshape library and the German fingerspelling alphabet (Deutsches Fingeralphabet, DGS).
 *
 * Each shape is a partial pose (see hand.js); anything not listed stays at the neutral open hand.
 * The handshapes are approximations of the one-handed DGS fingerspelling alphabet as shown in
 * Anhang 2 of "Projektinternes Arbeitspapier AP03-2018-01" (DGS-Korpus, Universität Hamburg).
 * They are not copies of that chart, and a Deaf signer must check them before real use.
 *
 * Movement signs. As in the chart, J and Z move, and so do Ä, Ö, Ü (the handshapes of A, O, U
 * with a downward movement), ß (S with an up-and-down movement) and the signs SCH, CH and AA
 * (sideways). The camera reads still handshapes only, so these shapes are animated but never
 * recognised from an image.
 *
 * shape.motion: falsy (still), or a movement name:
 *   'wiggle' (J, Z), 'down' (Ä, Ö, Ü), 'updown' (ß), 'side' (SCH, CH, AA).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SignBridge = root.SignBridge || {};
    root.SignBridge.Shapes = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CURL = { mcp: 85, pip: 95, dip: 50 }; // fingers folded into a fist
  const HALF = { mcp: 35, pip: 50, dip: 30 }; // fingers loosely curved
  const TIGHT = { mcp: 80, pip: 100, dip: 60 }; // fingers folded tightly (E)
  const CURVED = { mcp: 40, pip: 45, dip: 30 }; // fingers curved around a round O
  const HOOK = { mcp: 20, pip: 80, dip: 35 }; // index hooked at the middle joint (X)

  const POSE_A = { index: CURL, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -35, mcp: 5 } };
  const POSE_O = { index: CURVED, middle: CURVED, ring: CURVED, pinky: CURVED, thumb: { psi: -25, mcp: 50, ip: 30 } };
  const POSE_U = { index: { psi: -3 }, middle: { psi: 3 }, ring: CURL, pinky: CURL, thumb: { psi: 25, mcp: 60, ip: 45 } };
  const POSE_S = { index: CURL, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: 5, mcp: 60, ip: 45 } };

  const SHAPES = {
    A: { pose: POSE_A },
    B: { pose: { thumb: { psi: 40, mcp: 75, ip: 55 } } },
    C: { pose: { index: HALF, middle: HALF, ring: HALF, pinky: HALF, thumb: { psi: -50, mcp: 25, ip: 25 } } },
    D: { pose: { middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -15, mcp: 40, ip: 30 } } },
    E: { pose: { index: TIGHT, middle: TIGHT, ring: TIGHT, pinky: TIGHT, thumb: { psi: -25, mcp: 45, ip: 45 } } },
    F: { pose: { index: { mcp: 35, pip: 60, dip: 30 }, thumb: { psi: -35, mcp: 30, ip: 35 } } },
    G: { pose: { roll: -90, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -15 } } },
    H: { pose: { roll: -90, ring: CURL, pinky: CURL, thumb: { psi: -20, mcp: 25, ip: 15 } } },
    I: { pose: { index: CURL, middle: CURL, ring: CURL, thumb: { psi: 25, mcp: 55, ip: 40 } } },
    J: { motion: 'wiggle', pose: { index: CURL, middle: CURL, ring: CURL, thumb: { psi: 25, mcp: 55, ip: 40 } } },
    K: { pose: { index: { psi: -10 }, middle: { psi: 8 }, ring: CURL, pinky: CURL, thumb: { psi: -2, mcp: 20, ip: 20 } } },
    L: { pose: { middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -90 } } },
    M: { pose: { index: CURL, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: 30, mcp: 75, ip: 60 } } },
    N: { pose: { index: CURL, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -4, mcp: 75, ip: 55 } } },
    O: { pose: POSE_O },
    P: { pose: { roll: 180, index: { psi: -10 }, middle: { psi: 8 }, ring: CURL, pinky: CURL, thumb: { psi: -2, mcp: 20, ip: 20 } } },
    Q: { pose: { roll: -180, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -15 } } },
    R: { pose: { index: { psi: 3 }, middle: { psi: -6 }, ring: CURL, pinky: CURL, thumb: { psi: -20, mcp: 45, ip: 30 } } },
    S: { pose: POSE_S },
    T: { pose: { index: CURL, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -12, mcp: 35, ip: 20 } } },
    U: { pose: POSE_U },
    V: { pose: { index: { psi: -12 }, middle: { psi: 10 }, ring: CURL, pinky: CURL, thumb: { psi: 25, mcp: 60, ip: 45 } } },
    W: { pose: { index: { psi: -12 }, middle: { psi: 0 }, ring: { psi: 10 }, pinky: CURL, thumb: { psi: 5, mcp: 55, ip: 45 } } },
    X: { pose: { index: HOOK, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -30, mcp: 40, ip: 25 } } },
    Y: { pose: { index: CURL, middle: CURL, ring: CURL, pinky: { psi: 12 }, thumb: { psi: -85 } } },
    Z: { motion: 'wiggle', pose: { index: { psi: -6 }, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -20, mcp: 40, ip: 25 } } },

    // Umlauts: the base handshape with a downward movement.
    'Ä': { motion: 'down', pose: POSE_A },
    'Ö': { motion: 'down', pose: POSE_O },
    'Ü': { motion: 'down', pose: POSE_U },
    // ß: the S handshape with an up-and-down movement.
    'ß': { motion: 'updown', pose: POSE_S },
    // Digraph signs: sideways movement.
    SCH: { motion: 'side', pose: {} }, // flat, open hand
    CH: { motion: 'side', pose: { index: CURL, middle: CURL, ring: CURL, pinky: CURL, thumb: { psi: -60, mcp: 0, ip: 0 } } },
    AA: { motion: 'side', pose: POSE_A },
  };

  // Movement kind of a shape: null when still, otherwise a name (a plain `true` means 'wiggle').
  function motionKindOf(def) {
    if (!def || !def.motion) return null;
    return typeof def.motion === 'string' ? def.motion : 'wiggle';
  }

  const germanLetters = {};
  for (const c of 'abcdefghijklmnopqrstuvwxyz') germanLetters[c] = c.toUpperCase();
  Object.assign(germanLetters, { 'ä': 'Ä', 'ö': 'Ö', 'ü': 'Ü', 'ß': 'ß' });

  const DGS = {
    id: 'dgs',
    name: 'Deutsches Fingeralphabet (DGS)',
    caseOutput: 'upper',
    aliases: {},
    letters: germanLetters,
    // Multi-letter signs, longest first. Matched from the left, so "schach" reads SCH-A-CH.
    digraphs: [['sch', 'SCH'], ['ch', 'CH'], ['aa', 'AA']],
    source: 'DGS-Korpus, Projektinternes Arbeitspapier AP03-2018-01, Anhang 2 (Universität Hamburg)',
  };

  const ALPHABETS = { dgs: DGS };

  // Shape name for one typed character, or null when the alphabet has no sign for it.
  function lookupLetter(alphabet, ch) {
    if (typeof ch !== 'string' || ch.length === 0) return null;
    const key = ch.toLocaleLowerCase();
    const resolved = Object.prototype.hasOwnProperty.call(alphabet.aliases, key) ? alphabet.aliases[key] : key;
    return Object.prototype.hasOwnProperty.call(alphabet.letters, resolved) ? alphabet.letters[resolved] : null;
  }

  // The letter as it is printed: capitals for A–Z, Ä, Ö, Ü; ß stays ß (its capital form is not used).
  function displayLetter(alphabet, key) {
    if (key === 'ß') return 'ß';
    return alphabet.caseOutput === 'upper' ? key.toLocaleUpperCase() : key;
  }

  // Capital form for a letter of the running text (used for the labels of the sign sequence).
  function caseLabel(ch) {
    return ch === 'ß' ? 'ß' : ch.toLocaleUpperCase();
  }

  // Every printed form that uses a shape: single letters, then multi-letter signs.
  function lettersForShape(alphabet, shape) {
    const out = [];
    for (const key of Object.keys(alphabet.letters)) {
      if (alphabet.letters[key] === shape) out.push(displayLetter(alphabet, key));
    }
    for (const [text, s] of alphabet.digraphs || []) {
      if (s === shape) out.push(text.toLocaleUpperCase());
    }
    return out;
  }

  // Letter to print for a recognised shape, or null when the alphabet does not use that shape.
  function letterForShape(alphabet, shape) {
    const list = lettersForShape(alphabet, shape);
    return list.length ? list[0] : null;
  }

  // Shapes the camera can produce: still handshapes only.
  function recognizableShapes() {
    return Object.keys(SHAPES).filter((name) => !motionKindOf(SHAPES[name]));
  }

  return {
    SHAPES,
    DGS,
    ALPHABETS,
    lookupLetter,
    letterForShape,
    lettersForShape,
    displayLetter,
    caseLabel,
    motionKindOf,
    recognizableShapes,
  };
});
