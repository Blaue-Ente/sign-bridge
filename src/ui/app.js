/*
 * SignBridge page logic. Connects the core modules to the page.
 * Camera frames are processed in the browser and are never uploaded.
 */
(function () {
  'use strict';

  const SB = window.SignBridge;
  const Hand = SB.Hand;
  const Shapes = SB.Shapes;
  const Translator = SB.Translator;
  const Recognizer = SB.Recognizer;
  const Renderer = SB.Renderer;
  const I18n = SB.I18n;

  const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
  const CALIB_TARGET = 30; // frames recorded per calibration
  const CALIB_MIN_USE = 5; // samples needed before a shape uses only the user's samples
  const PAUSE_SYMBOL = '·';

  const $ = (id) => document.getElementById(id);
  const el = {
    langSelect: $('langSelect'),
    textInput: $('textInput'),
    playBtn: $('playBtn'),
    stopBtn: $('stopBtn'),
    replayBtn: $('replayBtn'),
    speedInput: $('speedInput'),
    speedValue: $('speedValue'),
    textStatus: $('textStatus'),
    skippedNote: $('skippedNote'),
    handCanvas: $('handCanvas'),
    currentLabel: $('currentLabel'),
    motionNote: $('motionNote'),
    sequence: $('sequence'),
    video: $('video'),
    overlay: $('overlay'),
    camPlaceholder: $('camPlaceholder'),
    camBtn: $('camBtn'),
    camStatus: $('camStatus'),
    liveText: $('liveText'),
    liveBar: $('liveBar'),
    output: $('output'),
    spaceBtn: $('spaceBtn'),
    backspaceBtn: $('backspaceBtn'),
    clearBtn: $('clearBtn'),
    copyBtn: $('copyBtn'),
    copyStatus: $('copyStatus'),
    calibShape: $('calibShape'),
    calibRecordBtn: $('calibRecordBtn'),
    calibClearBtn: $('calibClearBtn'),
    calibResetBtn: $('calibResetBtn'),
    calibStatus: $('calibStatus'),
    calibCounts: $('calibCounts'),
    alphabetGrid: $('alphabetGrid'),
  };

  // German is the default; English is the second language.
  const state = {
    lang: 'de',
    timeline: null,
    skipped: [],
    elapsed: 0,
    lastFrame: 0,
    playing: false,
    paused: false,
    speed: 1,
    raf: 0,
    cam: { stream: null, running: false, hands: null, busy: false },
    stabilizer: Recognizer.createStabilizer({ windowSize: 8, required: 6, releaseMs: 500 }),
    output: '',
    recording: null,
    live: { kind: 'idle' },
  };

  const t = (key, vars) => I18n.t(state.lang, key, vars);
  const alphabet = () => Shapes.ALPHABETS.dgs;
  const letterFor = (shape) => Shapes.letterForShape(alphabet(), shape);
  const lettersFor = (shape) => Shapes.lettersForShape(alphabet(), shape);

  function safeStorage() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }

  // Default templates for every recognisable shape. The seed keeps them identical on every load.
  const defaultPrototypes = Recognizer.buildPrototypes({
    shapes: Shapes.recognizableShapes(),
    poseFor: (name) => Hand.normalizePose(Shapes.SHAPES[name].pose),
    featuresFor: Hand.poseFeatures,
    variants: 7,
    rng: Hand.makeRng(20261118),
    sigmaDeg: 4,
  });
  const calibration = Recognizer.createCalibrationStore(safeStorage(), Recognizer.DEFAULT_STORAGE_KEY, CALIB_TARGET);
  let classifier = null;

  function rebuildClassifier() {
    const merged = Recognizer.mergePrototypes(defaultPrototypes, calibration.all(), CALIB_MIN_USE);
    classifier = Recognizer.createClassifier({ prototypes: merged, threshold: Recognizer.DEFAULT_THRESHOLD });
  }

  // ---- Status text that is re-translated when the language changes ----

  function setStatus(node, key, vars) {
    node.dataset.key = key || '';
    node.dataset.vars = JSON.stringify(vars || {});
    node.textContent = key ? t(key, vars) : '';
  }

  function refreshStatuses() {
    document.querySelectorAll('.status[data-key]').forEach((node) => {
      if (node.dataset.key) node.textContent = t(node.dataset.key, JSON.parse(node.dataset.vars || '{}'));
    });
  }

  function applyLanguage() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
      node.setAttribute('aria-label', t(node.dataset.i18nAria));
    });
    el.output.dataset.placeholder = t('outputPlaceholder');
    el.speedValue.textContent = state.speed + '×';
    updatePlayButton();
    updateCamButton();
    refreshStatuses();
    renderLive();
    renderSkipped();
    renderChips();
    renderShapeOptions();
    renderCalibCounts();
    renderAlphabetGrid();
    languageListeners.forEach((fn) => fn(state.lang));
  }

  const languageListeners = [];

  // ---- Tabs ----

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });
    ['talk', 'text', 'sign', 'alphabet'].forEach((panel) => {
      $('panel-' + panel).hidden = panel !== name;
    });
  }

  // ---- Text to sign ----

  function lookupShape(name) {
    const def = Shapes.SHAPES[name];
    return def
      ? { pose: Hand.normalizePose(def.pose), motion: !!def.motion, motionKind: Shapes.motionKindOf(def) }
      : null;
  }

  function buildSequence() {
    const plan = Translator.buildPlan(el.textInput.value, {
      alphabet: alphabet(),
      dictionary: window.SIGN_DICTIONARY || {},
      lookupShape,
      markUnsupported: true,
    });
    state.skipped = plan.skipped;
    // Stepped: whole handshapes only, with a short empty gap between them. No generated
    // in-between hand poses, and a repeated letter (LL) is visibly shown twice.
    const hasSign = plan.steps.some((s) => s.kind === 'sign');
    state.timeline = hasSign ? Translator.createTimeline(plan.steps, { stepped: true, gapMs: 180 }) : null;
    renderChips();
    renderSkipped();
    el.motionNote.hidden = !(state.timeline && state.timeline.steps.some((s) => s.motion));
    return state.timeline;
  }

  function renderSkipped() {
    el.skippedNote.hidden = state.skipped.length === 0;
    el.skippedNote.textContent = state.skipped.length ? t('skipped', { chars: state.skipped.join(' ') }) : '';
  }

  // One picture per step, with its letter underneath. Tap a picture to jump to it.
  const FRAME_PX = 112;

  function renderChips() {
    el.sequence.textContent = '';
    if (!state.timeline) return;
    state.timeline.steps.forEach((step, i) => {
      const frame = document.createElement('button');
      frame.type = 'button';
      frame.className = 'frame ' + step.kind;
      frame.dataset.index = String(i);

      const pic = document.createElement('span');
      pic.className = 'frame-pic';
      pic.setAttribute('aria-hidden', 'true');
      if (step.kind === 'sign') {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = FRAME_PX * 2;
        Renderer.drawHand(canvas.getContext('2d'), FRAME_PX * 2, FRAME_PX * 2, Hand.modelLandmarks(step.pose));
        pic.appendChild(canvas);
      } else {
        pic.textContent = step.kind === 'rest' ? PAUSE_SYMBOL : '?';
      }

      const caption = document.createElement('span');
      caption.className = 'frame-label';
      caption.textContent = step.kind === 'rest' ? '' : step.label;

      const name = step.kind === 'rest' ? t('pause') : step.kind === 'unsupported' ? step.label + ': ' + t('unsupportedTag') : step.label;
      frame.setAttribute('aria-label', (i + 1) + '. ' + name);
      if (step.kind === 'unsupported') frame.title = t('unsupportedTag');
      frame.append(pic, caption);
      frame.addEventListener('click', () => seekTo(i));
      el.sequence.appendChild(frame);
    });
  }

  function markCurrent(index) {
    for (const chip of el.sequence.children) {
      const on = Number(chip.dataset.index) === index;
      if (on && !chip.classList.contains('current') && chip.offsetParent) {
        // Keep the current picture visible in the strip without scrolling the page.
        const strip = el.sequence;
        const left = chip.offsetLeft - strip.offsetLeft;
        if (left < strip.scrollLeft || left + chip.offsetWidth > strip.scrollLeft + strip.clientWidth) {
          strip.scrollLeft = Math.max(0, left - 16);
        }
      }
      chip.classList.toggle('current', on);
      if (on) chip.setAttribute('aria-current', 'step');
      else chip.removeAttribute('aria-current');
    }
  }

  function showSample(sample) {
    const size = el.handCanvas.width;
    const ctx = el.handCanvas.getContext('2d');
    if (!sample) {
      Renderer.drawHand(ctx, size, size, Hand.modelLandmarks(Hand.normalizePose({})));
      el.currentLabel.textContent = '';
      markCurrent(-1);
      return;
    }
    if (sample.pose) Renderer.drawHand(ctx, size, size, Hand.modelLandmarks(sample.pose), { offset: sample.offset });
    else ctx.clearRect(0, 0, size, size); // gap, pause or unsupported character: no hand
    el.currentLabel.textContent =
      sample.phase === 'gap' ? '' : sample.step.kind === 'rest' ? PAUSE_SYMBOL : sample.step.kind === 'unsupported' ? '? ' + sample.step.label : sample.step.label;
    markCurrent(sample.index);
    setStatus(el.textStatus, 'step', { n: sample.index + 1, total: state.timeline.steps.length });
  }

  function updatePlayButton() {
    el.playBtn.textContent = !state.playing ? t('play') : state.paused ? t('resume') : t('pause');
  }

  function updateCamButton() {
    el.camBtn.textContent = state.cam.running ? t('camStop') : t('camStart');
  }

  function resetPlayback() {
    cancelAnimationFrame(state.raf);
    state.playing = false;
    state.paused = false;
    state.elapsed = 0;
    updatePlayButton();
  }

  function tick(now) {
    if (!state.playing || !state.timeline) return;
    if (!state.paused) state.elapsed += Math.max(0, now - state.lastFrame) * state.speed;
    state.lastFrame = now;
    const sample = Translator.sampleTimeline(state.timeline, state.elapsed);
    showSample(sample);
    if (sample.phase === 'done') {
      state.playing = false;
      state.paused = false;
      updatePlayButton();
      return;
    }
    state.raf = requestAnimationFrame(tick);
  }

  function onPlayClick() {
    if (state.playing) {
      state.paused = !state.paused;
      state.lastFrame = performance.now();
      updatePlayButton();
      return;
    }
    if (!buildSequence()) {
      setStatus(el.textStatus, 'nothingToPlay');
      return;
    }
    state.elapsed = 0;
    state.playing = true;
    state.paused = false;
    state.lastFrame = performance.now();
    updatePlayButton();
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(tick);
  }

  // Stops playback and clears the sign view. Used by Stop and whenever the text changes,
  // so that no step from an earlier sequence stays on screen.
  function resetView() {
    resetPlayback();
    showSample(null);
    setStatus(el.textStatus, 'idle');
  }

  function onStopClick() {
    resetView();
  }

  function onReplayClick() {
    resetPlayback();
    onPlayClick();
  }

  function seekTo(index) {
    if (!state.timeline) buildSequence();
    if (!state.timeline) return;
    const step = state.timeline.steps[index];
    state.elapsed = state.timeline.starts[index] + step.move + 1; // inside the hold of that step
    if (state.playing) state.lastFrame = performance.now();
    showSample(Translator.sampleTimeline(state.timeline, state.elapsed));
  }

  function renderShapeOptions() {
    const previous = el.calibShape.value;
    el.calibShape.textContent = '';
    for (const name of Shapes.recognizableShapes()) {
      const option = document.createElement('option');
      option.value = name;
      const letters = lettersFor(name);
      option.textContent = letters.length ? name + ' · ' + letters.join(' / ') : name;
      el.calibShape.appendChild(option);
    }
    if (previous) el.calibShape.value = previous;
  }

  function renderAlphabetGrid() {
    el.alphabetGrid.textContent = '';
    for (const name of Object.keys(Shapes.SHAPES)) {
      const def = Shapes.SHAPES[name];
      const card = document.createElement('div');
      card.className = 'shape-card';

      const canvas = document.createElement('canvas');
      canvas.className = 'shape-canvas';
      canvas.width = 240;
      canvas.height = 240;
      Renderer.drawHand(canvas.getContext('2d'), 240, 240, Hand.modelLandmarks(Hand.normalizePose(def.pose)));

      const caption = document.createElement('div');
      caption.className = 'shape-caption';
      const big = document.createElement('strong');
      const letters = lettersFor(name);
      big.textContent = letters.length ? letters.join(' / ') : '—';
      const small = document.createElement('span');
      small.className = 'muted small';
      small.textContent = Shapes.motionKindOf(def) ? name + ' · ' + t('motionTag') : name;
      caption.append(big, small);

      card.append(canvas, caption);
      el.alphabetGrid.appendChild(card);
    }
  }

  // ---- Sign to text ----

  function renderLive() {
    const live = state.live;
    let text = '—';
    let confidence = 0;
    if (live.kind === 'nohand') {
      text = t('noHand');
    } else if (live.kind === 'none') {
      text = t('liveNone');
    } else if (live.kind === 'shape') {
      const letter = letterFor(live.shape);
      text = letter || t('liveNotInAlphabet', { shape: live.shape });
      confidence = live.confidence;
    }
    el.liveText.textContent = text;
    el.liveBar.style.width = Math.round(confidence * 100) + '%';
  }

  function setLive(live) {
    state.live = live;
    renderLive();
  }

  function renderOutput() {
    el.output.textContent = state.output;
  }

  function appendText(text) {
    state.output += text;
    renderOutput();
  }

  // Only a stable shape becomes a letter (see the stabiliser in core/recognizer.js).
  function feedStabilizer(shape) {
    const emitted = state.stabilizer.push(shape, performance.now());
    if (!emitted) return;
    const letter = letterFor(emitted);
    if (letter) appendText(letter);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(script);
    });
  }

  async function ensureHandTracking() {
    if (state.cam.hands) return state.cam.hands;
    if (!window.Hands) await loadScript(MP_BASE + '/hands.js');
    if (!window.Hands) throw new Error('Hand tracking library unavailable');
    const hands = new window.Hands({ locateFile: (file) => MP_BASE + '/' + file });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
    hands.onResults(onHandResults);
    if (typeof hands.initialize === 'function') await hands.initialize();
    state.cam.hands = hands;
    return hands;
  }

  function releaseStream() {
    if (state.cam.stream) state.cam.stream.getTracks().forEach((track) => track.stop());
    state.cam.stream = null;
    el.video.srcObject = null;
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(el.camStatus, 'camUnsupported');
      return;
    }
    setStatus(el.camStatus, 'camStarting');
    try {
      state.cam.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      el.video.srcObject = state.cam.stream;
      await el.video.play();
    } catch (err) {
      releaseStream();
      setStatus(el.camStatus, 'camDenied');
      return;
    }
    state.cam.running = true;
    el.camPlaceholder.hidden = true;
    updateCamButton();
    setLive({ kind: 'nohand' });
    setStatus(el.camStatus, 'handsLoading');
    try {
      await ensureHandTracking();
    } catch (err) {
      if (state.cam.running) setStatus(el.camStatus, 'handsFailed');
      return;
    }
    if (!state.cam.running) return; // stopped while the library was loading
    setStatus(el.camStatus, 'handsReady');
    frameLoop();
  }

  function stopCamera() {
    const wasRecording = !!state.recording;
    state.cam.running = false;
    state.cam.busy = false;
    releaseStream();
    state.recording = null;
    el.calibRecordBtn.disabled = false;
    if (wasRecording) setStatus(el.calibStatus, '');
    el.camPlaceholder.hidden = false;
    updateCamButton();
    setStatus(el.camStatus, 'camIdle');
    Renderer.drawLandmarks(el.overlay.getContext('2d'), el.overlay.width, el.overlay.height, null);
    state.stabilizer.reset();
    setLive({ kind: 'idle' });
  }

  function frameLoop() {
    if (!state.cam.running) return;
    if (!state.cam.busy && state.cam.hands && el.video.readyState >= 2) {
      state.cam.busy = true;
      state.cam.hands
        .send({ image: el.video })
        .catch(() => {})
        .then(() => {
          state.cam.busy = false;
        });
    }
    requestAnimationFrame(frameLoop);
  }

  function onHandResults(results) {
    if (!state.cam.running) return;
    const video = el.video;
    const overlay = el.overlay;
    if (video.videoWidth && (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight)) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }
    const ctx = overlay.getContext('2d');
    const hands = results.multiHandLandmarks || [];
    if (hands.length === 0) {
      Renderer.drawLandmarks(ctx, overlay.width, overlay.height, null);
      setLive({ kind: 'nohand' });
      feedStabilizer(null);
      return;
    }

    const landmarks = hands[0];
    Renderer.drawLandmarks(ctx, overlay.width, overlay.height, landmarks);
    const vec = Hand.featuresFromLandmarks(landmarks, video.videoWidth || 640, video.videoHeight || 480);
    if (state.recording) {
      recordSample(vec);
      return;
    }

    const best = classifier.classify(vec);
    if (best && best.accepted) {
      const confidence = Math.max(0, Math.min(1, 1 - best.distance / Recognizer.DEFAULT_THRESHOLD));
      setLive({ kind: 'shape', shape: best.shape, confidence });
      feedStabilizer(best.shape);
    } else {
      setLive({ kind: 'none' });
      feedStabilizer(null);
    }
  }

  // ---- Output buttons ----

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(state.output);
      setStatus(el.copyStatus, 'copied');
    } catch (err) {
      setStatus(el.copyStatus, 'copyFailed');
    }
  }

  // ---- Calibration ----

  function renderCalibCounts() {
    const all = calibration.all();
    const shapes = Object.keys(all).filter((k) => all[k].length > 0);
    const total = shapes.reduce((sum, k) => sum + all[k].length, 0);
    el.calibCounts.textContent = total
      ? t('calibCounts', { n: shapes.map((k) => k + ' ' + all[k].length).join(', ') })
      : t('calibNone');
  }

  function onRecordClick() {
    if (state.recording) return;
    if (!state.cam.running) {
      setStatus(el.calibStatus, 'calibNeedCamera');
      return;
    }
    state.recording = { shape: el.calibShape.value, count: 0 };
    el.calibRecordBtn.disabled = true;
    setStatus(el.calibStatus, 'calibRecording', { n: 0 });
  }

  function recordSample(vec) {
    const rec = state.recording;
    calibration.add(rec.shape, vec);
    rec.count += 1;
    if (rec.count < CALIB_TARGET) {
      setStatus(el.calibStatus, 'calibRecording', { n: rec.count });
      return;
    }
    state.recording = null;
    el.calibRecordBtn.disabled = false;
    rebuildClassifier();
    renderCalibCounts();
    setStatus(el.calibStatus, 'calibDone', { shape: rec.shape });
  }

  function onClearShapeClick() {
    calibration.clear(el.calibShape.value);
    rebuildClassifier();
    renderCalibCounts();
    setStatus(el.calibStatus, '');
  }

  function onResetAllClick() {
    calibration.clear();
    rebuildClassifier();
    renderCalibCounts();
    setStatus(el.calibStatus, '');
  }

  // ---- Wiring ----

  function bind() {
    const tabs = Array.from(document.querySelectorAll('.tab'));
    tabs.forEach((btn, i) => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
      // WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs.
      btn.addEventListener('keydown', (e) => {
        const moves = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
        if (!(e.key in moves)) return;
        e.preventDefault();
        const next = tabs[(moves[e.key] + tabs.length) % tabs.length];
        next.focus();
        showTab(next.dataset.tab);
      });
    });
    el.langSelect.addEventListener('change', () => {
      state.lang = el.langSelect.value;
      applyLanguage();
    });
    el.textInput.addEventListener('input', () => {
      resetView();
      buildSequence();
    });
    el.playBtn.addEventListener('click', onPlayClick);
    el.stopBtn.addEventListener('click', onStopClick);
    el.replayBtn.addEventListener('click', onReplayClick);
    el.speedInput.addEventListener('input', () => {
      state.speed = Number(el.speedInput.value);
      el.speedValue.textContent = state.speed + '×';
    });
    el.camBtn.addEventListener('click', () => (state.cam.running ? stopCamera() : startCamera()));
    el.spaceBtn.addEventListener('click', () => appendText(' '));
    el.backspaceBtn.addEventListener('click', () => {
      state.output = Array.from(state.output).slice(0, -1).join('');
      renderOutput();
    });
    el.clearBtn.addEventListener('click', () => {
      state.output = '';
      renderOutput();
    });
    el.copyBtn.addEventListener('click', copyOutput);
    el.calibRecordBtn.addEventListener('click', onRecordClick);
    el.calibClearBtn.addEventListener('click', onClearShapeClick);
    el.calibResetBtn.addEventListener('click', onResetAllClick);
  }

  function init() {
    el.langSelect.value = state.lang;
    rebuildClassifier();
    bind();
    applyLanguage();
    showSample(null);
    setStatus(el.textStatus, 'idle');
    setStatus(el.camStatus, 'camIdle');
    showTab('talk');
  }

  // Small interface for the conversation view (src/ui/conversation.js).
  SB.App = {
    t,
    lang: () => state.lang,
    onLanguage: (fn) => languageListeners.push(fn),
    showTab,
    // Shows the text as fingerspelling in the "Text → Gebärde" tab and starts playback.
    playText(text) {
      el.textInput.value = text;
      resetView();
      buildSequence();
      showTab('text');
      onPlayClick();
    },
    // For the export (src/ui/export.js): the sequence of the Buchstabieren tab, or null.
    spelling() {
      if (!state.timeline) buildSequence();
      return state.timeline ? { timeline: state.timeline, text: el.textInput.value.trim(), speed: state.speed } : null;
    },
    setStatus,
    signedText: () => state.output,
    clearSignedText() {
      state.output = '';
      renderOutput();
    },
  };

  init();
})();
