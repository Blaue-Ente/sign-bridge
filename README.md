# SignBridge

A browser prototype that helps deaf and hearing people (gehörlose und hörende Menschen) talk face to face in German. It has four separate parts, and they are kept apart on purpose:

| Part | What it does | What it is not |
|---|---|---|
| **Speech ↔ text** (Gespräch) | Speech-to-text, typing, text-to-speech, quick messages | Not sign language |
| **DGS video phrases** (In DGS anzeigen) | Plays a recorded DGS clip of a whole sentence, if one exists and is approved | Not a translation of free text; no clips are included yet |
| **Fingerspelling** (Buchstabieren) | Shows text letter by letter in the DGS fingerspelling alphabet, including Ä, Ö, Ü, ß, SCH, CH and AA | Not a DGS translation |
| **Camera recognition** (Gebärde → Text, experimental) | Reads still fingerspelled letters from one hand | Not recognition of signs or sentences |

No install and no build step. It runs in a browser tab. The interface is German, with English as the second language.

**Online:** <https://blaue-ente.github.io/sign-bridge/> (GitHub Pages, works on a phone too). It is meant for personal, non-commercial use.

> **Status: prototype.** It recognises still handshapes (fingerspelled letters), not full sign language. The handshapes are approximations and need a DGS signer to check them. See *Limits*.

## Run it

Option 1: double-click `index.html`.

Option 2 (recommended): from this folder run

```
python -m http.server 8000
```

and open http://localhost:8000. Camera access needs `localhost` or `file://`.

The first time the camera starts, the hand-tracking library and its model are downloaded from the jsDelivr CDN (`@mediapipe/hands@0.4.1675469240`). Camera frames are processed in the browser and are never uploaded.

## Use it

- **Gespräch (main screen):** for a face-to-face conversation on one device. The newest message is shown in very large text, coloured by who wrote it. The hearing person speaks (🎤 Sprechen, speech-to-text) or types; the deaf person types, taps a quick message, or takes over the fingerspelled text from the camera, and the message is read aloud. Enter sends, Shift+Enter starts a new line. The history can be copied or cleared and is deleted when the tab closes. *Im Fingeralphabet zeigen* plays the current message as fingerspelling.
- **In DGS anzeigen:** looks the current message up as a whole sentence in the DGS phrase catalogue (`src/data/dgs-phrases.js`). A clip is shown only if it exists and both its language check by a DGS signer and its publishing rights are marked `approved`. Otherwise the app says *Für diese Nachricht ist kein DGS-Video verfügbar*. Sentences are never assembled word by word. The catalogue lists the quick messages but has **no clips yet**; see the comment in that file for how to add one.
- **Buchstabieren:** type, then press *Abspielen*; *Pause*, *Wiederholen* and *Stopp* control playback, and the speed runs from 0.5× to 2×. Each letter appears as its own picture with the letter underneath, and the picture strip can be tapped to jump to a letter. Handshapes change as whole frames with a short empty gap: no in-between hand poses are generated, and a doubled letter (LL) is shown twice. Spaces and punctuation are pauses. Characters with no fingerspelling sign are marked with **?** and listed. The movement of J, Z, Ä, Ö, Ü, ß, SCH, CH and AA is only hinted at by a model animation, not a recorded one.
- **Save as a picture or an animation:** under the picture strip, *Als Bild speichern (PNG)* saves every handshape with its letter, one row per word, and *Als Animation speichern (GIF)* saves the sequence as a looping animation with the same empty gaps as the player, at the speed that is set. Both say *Fingeralphabet (DGS) – keine DGS-Übersetzung* and that the handshapes are not checked by DGS signers. They are made in the browser and are not uploaded. Examples for "Guten Tag" are in `examples/`.
- **Gebärde → Text:** press *Kamera einschalten* and show one hand, palm toward the camera. A letter is written once the same handshape is held steadily for about half a second. To repeat the same letter, take the hand out of view for half a second first. Use Leerzeichen, Löschen, Leeren and Kopieren.
- **Kalibrierung (empfohlen):** the default handshapes are approximations. Open the calibration section, pick a handshape, hold it in front of the camera and press *30 Bilder aufnehmen*. The samples are stored in this browser only (localStorage). Once a handshape has at least 5 of your samples, only your samples are used for it.
- **Fingeralphabet:** the tab shows every handshape with the letters it stands for.
- **Sprache:** German by default. Choose *English* to switch the interface.

## Limits

- Only fingerspelled letters. Word signs, sentences, grammar, facial expression and body movement are not covered.
- **Movement signs are not recognised from the camera:** Ä, Ö, Ü, ß, SCH, CH, AA, J and Z. Their base shape appears instead (for example A for Ä). They are animated with their movement in text-to-sign mode.
- The handshapes approximate the DGS fingerspelling alphabet in the DGS-Korpus, Anhang 2 (Universität Hamburg). A DGS signer has not verified them, and the rule that matches SCH, CH and AA from the left is my assumption.
- Handshape variants (for example for D, F, G, J, K, T) are not modelled.
- Accuracy on real hands has not been measured. The tests check the model's own handshapes with synthetic noise. Treat those numbers as a sanity check, not as real-world accuracy.
- Lighting, camera angle and background all affect tracking.

## Accessibility and privacy

Built toward WCAG 2.2 level AA (the basis of EN 301 549 and the German BITV 2.0):

- Text size control (A− / A+, up to 160 %) and a high-contrast mode; both are remembered on the device.
- Light and dark themes follow the system; text and accent colours meet at least 4.5:1 contrast.
- Full keyboard use: skip link, visible focus, tabs with arrow keys / Home / End, Enter to send.
- Screen-reader support: labelled controls, `aria-live` for new messages and status text, correct `lang` attributes.
- Touch targets of at least 44 × 44 px, no horizontal scrolling at 320 px width, reduced motion respected.
- Privacy (DSGVO): no account, no server of our own. Camera frames stay on the device. The conversation history lives only in the open tab. Speech input uses the browser vendor's speech service (Google in Chrome), so the app asks once before the microphone is used.

**This has not been audited.** A formal WCAG/BITV test and testing with deaf and hard-of-hearing users are still needed before public use.

## Source

Anhang 2, "Fingeralphabet (DGS)", in *Projektinternes Arbeitspapier AP03-2018-01* (DGS-Korpus, Universität Hamburg): <https://www.sign-lang.uni-hamburg.de/dgs-korpus/arbeitspapiere/DGS-Korpus_AP03-2018-01v01_de.pdf>. The chart's pictures are the reference. No images are copied into this project.

## Files

```
index.html               page
styles.css               styles (light and dark)
src/core/hand.js         hand model: joint angles -> 21 landmarks; features that ignore position, rotation, scale and mirroring
src/core/shapes.js       handshape library (SHAPES) and the German DGS alphabet (DGS)
src/core/translator.js   text -> steps (letters, digraphs, pauses, unsupported characters); smooth or stepped timeline
src/core/recognizer.js   nearest-prototype classifier, calibration merge, stabiliser, calibration store
src/core/conversation.js conversation history, quick phrases (German and English), display settings
src/core/phrases.js      DGS phrase catalogue: whole-sentence lookup, only approved clips are returned
src/data/dgs-phrases.js  DGS phrase entries (no clips yet; how to add one is described in the file)
src/core/exporter.js     export plan: rows of the picture, frames of the animation, file names
src/core/gif.js          animated GIF encoder (palette, LZW), no dependencies
src/ui/export.js         draws and saves the picture (PNG) and the animation (GIF)
examples/                a saved picture and animation for "Guten Tag"
src/ui/conversation.js   conversation screen: speech-to-text, text-to-speech, quick phrases, text size, contrast
src/ui/app.js            page logic: camera, hand tracking, text playback, calibration, output
src/ui/renderer.js       canvas drawing of the hand and the camera overlay
src/ui/i18n.js           German and English strings
src/data/dictionary.js   optional word signs (empty)
tests/                   unit tests for the core modules
DESIGN.md                design notes, decisions and sources
```

## Tests

```
npm test
```

Uses Node's built-in test runner, so there are no dependencies. The 104 tests cover the hand features, the handshape library, the German alphabet (umlauts, ß, digraphs), the translator timeline (smooth and stepped), movement signs, the DGS phrase catalogue (available, missing and unapproved clips), the export plan and the GIF encoder (decoded back in the tests), the conversation history, the recogniser, the stabiliser and the calibration store.

## Extending

- **Word signs:** add entries to `window.SIGN_DICTIONARY` in `src/data/dictionary.js`. Each word maps to a list of frames `{ shape, hold }`, where `shape` is a name from `SHAPES` and `hold` is in milliseconds.
- **Handshapes:** edit `SHAPES` in `src/core/shapes.js`. A shape is a partial pose in degrees: `index: { psi, mcp, pip, dip }`, `thumb: { psi, mcp, ip, tip }`, plus `roll` and `pitch` for the whole hand. A movement is set with `motion: 'down' | 'updown' | 'side' | 'wiggle'`. Run `npm test` after any change.
- **Alphabet:** the letters and digraphs of the German alphabet are in `DGS` in `src/core/shapes.js`.
