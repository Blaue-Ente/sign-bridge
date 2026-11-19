# SignBridge: design

Status: prototype for German Sign Language (DGS). The build started before design approval, because the request was clear enough to act on. The calls below can be changed.

## Intent

A hearing person types German text and sees it shown in DGS fingerspelling. A Deaf signer's one-handed fingerspelling is read by a webcam and turned into German text. The goal is to find out whether the fingerspelling loop is useful before investing in full sign recognition.

## Goals

- German text to sign: letters A–Z, Ä, Ö, Ü, ß, and the signs SCH, CH and AA, with a pause between words, speed control, a highlighted step and a fingerspelling chart.
- Sign to text: the webcam recognises still DGS handshapes, stabilises them and builds German text. Space, Backspace, Clear and Copy.
- Calibration: the user records their own handshapes on the device. Calibration overrides the defaults.
- Interface in German (default) and English.
- Opens by double-clicking `index.html`. No install, no build step. Only the hand-tracking library needs internet.

## Non-goals

- Word signs and whole sentences. There is no sign database, so text is fingerspelled only.
- Recognising movement signs from video: J, Z, Ä, Ö, Ü, ß, SCH, CH, AA.
- Austrian (ÖGS) and Swiss (DSGS) variants. Only the German alphabet is covered.
- Accounts, cloud sync, uploading video.

## Anti-goals

- Sending camera frames anywhere. Video stays in the browser tab.
- Presenting the approximated handshapes as the verified DGS alphabet.

## Source

- The handshapes come from Anhang 2, "Fingeralphabet (DGS)", in *Projektinternes Arbeitspapier AP03-2018-01* (DGS-Korpus, Universität Hamburg), PDF page 23: <https://www.sign-lang.uni-hamburg.de/dgs-korpus/arbeitspapiere/DGS-Korpus_AP03-2018-01v01_de.pdf>. The chart is a picture; its text layer lists only the letter names.
- The text on PDF page 12 states that DGS uses the one-handed fingerspelling alphabet, and that D, F, G, J, K, T (and one more letter) have handshape variants. Only one form per letter is modelled.
- A web search found no per-letter descriptions, so the chart itself was the reference.
- The shapes are my parametric approximations of the chart. No image from the chart is copied into the project.
- Movements as drawn in the chart: Ä, Ö, Ü are the base handshape with a downward arrow; ß is the S handshape with an up arrow; SCH, CH and AA have sideways arrows; J and Z have a path (arc and zigzag).

## Constraints

- Classic scripts, not ES modules, so `file://` works.
- Hand tracking: `@mediapipe/hands@0.4.1675469240` from `cdn.jsdelivr.net`. The npm package contains the model, WASM and wrapper, so one CDN serves everything.
- Camera needs a secure context: `file://` or `localhost`.
- Phone width: 16 px side gutters, no horizontal page scroll.

## Approaches

1. **Parametric handshape library plus geometric recogniser (chosen).** A hand is a small skeleton: bends at each knuckle, sideways spread, whole-hand roll and pitch. The same skeleton draws the animation and produces the reference features for recognition. Recognition is nearest-neighbour on hand geometry, plus per-user calibration. It works offline with no training data. Accuracy is limited to still handshapes and depends on how close the definitions are to the real alphabet.
2. **Trained classifier** on a labelled DGS dataset (video or landmarks). Better accuracy, and it could cover movement signs and word signs. It needs labelled data, a training pipeline and a model file. Later step.
3. **Avatar driven by motion-capture or sign-notation data.** Most natural-looking animation. It needs a licensed sign database and a 3D pipeline. Later step.

Pick: approach 1 now. The handshape library and the recogniser sit behind small interfaces, so approach 2 or 3 can replace either one later.

## My calls

- **Platform:** static web app. Camera plus no install, and it also runs in a phone browser.
- **Alphabet:** DGS one-handed fingerspelling. German letters are A–Z, Ä, Ö, Ü and ß. The digraph signs SCH, CH and AA are matched greedily from the left, so "Schach" reads SCH-A-CH. **This matching rule is my assumption; a DGS signer should check it.**
- **ß:** shown as ß, never as "SS". The capital ẞ is read as ß.
- **Movement signs:** J and Z wiggle; Ä, Ö, Ü move down; ß moves up and down; SCH, CH and AA move sideways. They are animated, but the camera never recognises them, because the handshapes are the same as the still ones.
- **Hand model:** 21 landmarks in MediaPipe order, produced from a five-finger skeleton.
- **Features:** 31 values that do not depend on hand position, rotation, scale or left/right: finger bend angles, finger extension ratio, the gaps between neighbouring fingertips, thumb bends, thumb-to-finger and thumb-to-wrist distances, and two orientation values (fingers up or down, palm facing the camera). Spreads are fingertip gaps rather than angles, because the direction of a curled finger across the palm is unstable. The first version produced errors up to π.
- **Recognition:** nearest prototype among default templates (seven randomised variants per shape) and calibration samples. A shape is accepted when its distance is at most 3.0 (scaled units). On the model's own shapes with 4° noise, 98.6% are accepted and correct; an open hand is about 6 away and is rejected. The stabiliser needs 6 of the last 8 frames to agree. A repeated letter needs the hand to be released for 500 ms first.
- **Calibration keys:** shape names of the 24 still shapes. Calibration therefore applies to the same handshapes in every alphabet view.
- **Storage:** calibration in `localStorage` under one key. Every access is wrapped in try/catch, and the app works without it.
- **Interface language:** German by default, English as the second language. The earlier Bulgarian interface and alphabet draft were removed, because the app is now German.

## Limits

- The handshapes are approximations. A DGS signer must check every shape and the digraph rule.
- Ä, Ö, Ü, ß, SCH, CH, AA, J and Z are not recognised from the camera. The base shape appears instead (for example A for Ä). A movement detector is the next step, if it is wanted.
- Handshape variants (for example for D, F, G, J, K, T) are not modelled.
- Accuracy on real hands is unknown until real signers test it. Lighting, camera angle and background all affect tracking.
- Not an accessibility-certified product.

## Build status

1. Done: tests first for the core. `npm test` runs 65 tests, including the German cases: umlauts, ß, the digraphs, the movement kinds, and the offsets of movement signs.
2. Done: core modules in `src/core/`. The alphabet is the German DGS alphabet.
3. Done: UI in `index.html`, `styles.css` and `src/ui/`.
4. Verified in the browser: the page opens in German without console errors. The chart shows 33 cards, with the movement signs labelled. The calibration list has 24 still shapes. Playing "schön, Straße" shows SCH, Ö, N, the pause, S, T, R, A, ß, E (10 steps). The sign-to-text path was tested with a simulated camera and simulated landmarks: the letter L was recognised and written. Calibration was tested and then reset.
5. Not verified: a real webcam and real signers. Real-world accuracy is unknown.
