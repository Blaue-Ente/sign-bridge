/*
 * Conversation view: the main screen for a deaf and a hearing person talking face to face.
 *
 * - The newest message is shown very large, so both people can read it on one screen.
 * - Hearing side: type, speak (speech-to-text, de-DE), or tap a quick phrase.
 * - Deaf side: type, take over the fingerspelled text from the camera, or tap a quick phrase.
 *   Messages from the deaf side are read aloud (text-to-speech) if "Vorlesen" is on.
 * - Display settings: text size and high contrast, stored on this device.
 *
 * Speech recognition uses the browser's service. In Chrome and Edge, audio is sent to the
 * browser vendor's servers, so the user is asked once before the microphone is used.
 */
(function () {
  'use strict';

  const SB = window.SignBridge;
  const App = SB.App;
  const Conversation = SB.Conversation;
  const t = (key, vars) => App.t(key, vars);
  const $ = (id) => document.getElementById(id);

  const SETTINGS_KEY = 'signbridge.settings.v1';
  const CONSENT_KEY = 'signbridge.speechConsent.v1';
  const VOICE_LANG = { de: 'de-DE', en: 'en-US' };

  const el = {
    who: $('talkWho'),
    big: $('talkBig'),
    speakAgain: $('talkSpeakAgain'),
    fingerspell: $('talkFingerspell'),
    dgs: $('talkDgs'),
    dgsBox: $('dgsBox'),
    dgsVideo: $('dgsVideo'),
    dgsStatus: $('dgsStatus'),
    hearingInput: $('hearingInput'),
    hearingSend: $('hearingSend'),
    hearingMic: $('hearingMic'),
    micStatus: $('micStatus'),
    hearingPhrases: $('hearingPhrases'),
    deafInput: $('deafInput'),
    deafSend: $('deafSend'),
    deafFromSign: $('deafFromSign'),
    autoSpeak: $('autoSpeak'),
    deafPhrases: $('deafPhrases'),
    history: $('history'),
    historyCopy: $('historyCopy'),
    historyClear: $('historyClear'),
    historyStatus: $('historyStatus'),
    fontDown: $('fontDown'),
    fontUp: $('fontUp'),
    contrast: $('contrastToggle'),
  };

  const conversation = Conversation.createConversation({ max: 200 });
  let settings = Conversation.normalizeSettings(readJson(SETTINGS_KEY));
  let recognition = null;
  let listening = false;

  function readJson(key) {
    try {
      return JSON.parse(window.localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Settings then last for this page only.
    }
  }

  // ---- Display settings ----

  function applySettings() {
    const html = document.documentElement;
    html.style.setProperty('--font-scale', String(settings.fontScale));
    html.dataset.contrast = settings.contrast;
    el.contrast.checked = settings.contrast === 'high';
    el.autoSpeak.checked = settings.autoSpeak;
    el.fontDown.disabled = settings.fontScale <= 0.9;
    el.fontUp.disabled = settings.fontScale >= 1.6;
    writeJson(SETTINGS_KEY, settings);
  }

  function changeSettings(patch) {
    settings = Conversation.normalizeSettings(Object.assign({}, settings, patch));
    applySettings();
  }

  // ---- Speech output (deaf → hearing) ----

  const canSpeak = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

  function speak(text) {
    if (!canSpeak || !text) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = VOICE_LANG[App.lang()] || 'de-DE';
    u.rate = settings.speechRate;
    window.speechSynthesis.speak(u);
  }

  // ---- DGS video phrases ----
  // Only whole sentences with a checked, cleared clip are shown (src/core/phrases.js).

  const dgsCatalog = SB.Phrases.createPhraseCatalog(window.DGS_PHRASES || []);
  let dgsResult = null;

  function renderDgs() {
    const open = !!dgsResult;
    el.dgsBox.hidden = !open;
    el.dgs.textContent = open ? t('hideDgs') : t('showDgs');
    el.dgs.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) return;
    const available = dgsResult.status === 'available';
    el.dgsVideo.hidden = !available;
    el.dgsStatus.textContent = available ? t('dgsAvailable') : t('dgsMissing');
  }

  function closeDgs() {
    if (!el.dgsVideo.paused) el.dgsVideo.pause();
    el.dgsVideo.removeAttribute('src');
    el.dgsVideo.load();
    dgsResult = null;
    renderDgs();
  }

  function openDgs() {
    const last = conversation.last();
    if (!last) return;
    dgsResult = dgsCatalog.lookup(last.text);
    if (dgsResult.status === 'available') {
      el.dgsVideo.src = dgsResult.video;
      el.dgsVideo.setAttribute('aria-label', last.text);
    }
    renderDgs();
  }

  // ---- Messages ----

  function send(from, text, via) {
    const message = conversation.add(from, text, via);
    if (!message) return null;
    if (dgsResult) closeDgs(); // the clip belonged to the previous message
    render();
    if (from === 'deaf' && settings.autoSpeak) speak(message.text);
    return message;
  }

  function render() {
    const last = conversation.last();
    if (!last) {
      el.who.textContent = '';
      el.big.textContent = t('talkEmpty');
      el.big.classList.add('empty');
      el.big.dataset.from = '';
    } else {
      el.who.textContent = last.from === 'hearing' ? t('sideHearing') : t('sideDeaf');
      el.big.textContent = last.text;
      el.big.classList.remove('empty');
      el.big.dataset.from = last.from;
    }
    el.speakAgain.disabled = !last || !canSpeak;
    el.fingerspell.disabled = !last;
    el.dgs.disabled = !last;

    el.history.textContent = '';
    for (const m of conversation.list().slice().reverse()) {
      const li = document.createElement('li');
      li.className = 'msg msg-' + m.from;
      const meta = document.createElement('span');
      meta.className = 'msg-meta';
      const time = m.time.toLocaleTimeString(App.lang() === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
      meta.textContent = (m.from === 'hearing' ? t('sideHearing') : t('sideDeaf')) + ' · ' + time + ' · ' + t('via_' + m.via);
      const body = document.createElement('span');
      body.className = 'msg-text';
      body.textContent = m.text;
      li.append(meta, body);
      el.history.appendChild(li);
    }
    el.historyCopy.disabled = el.historyClear.disabled = conversation.list().length === 0;
  }

  function renderPhrases() {
    const lang = App.lang() === 'en' ? 'en' : 'de';
    for (const side of ['hearing', 'deaf']) {
      const box = side === 'hearing' ? el.hearingPhrases : el.deafPhrases;
      box.textContent = '';
      for (const phrase of Conversation.PHRASES[lang][side]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'phrase';
        b.textContent = phrase;
        b.addEventListener('click', () => send(side, phrase, 'phrase'));
        box.appendChild(b);
      }
    }
  }

  // Enter sends; Shift+Enter makes a new line.
  function bindComposer(input, button, from) {
    const submit = () => {
      if (send(from, input.value, 'typed')) input.value = '';
      input.focus();
    };
    button.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
  }

  // ---- Speech input (hearing → deaf) ----

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function setMicStatus(key) {
    el.micStatus.dataset.key = key || '';
    el.micStatus.dataset.vars = '{}';
    el.micStatus.textContent = key ? t(key) : '';
  }

  function updateMicButton() {
    el.hearingMic.textContent = listening ? t('micStop') : t('micStart');
    el.hearingMic.classList.toggle('recording', listening);
    el.hearingMic.setAttribute('aria-pressed', listening ? 'true' : 'false');
  }

  function stopListening() {
    if (recognition) recognition.stop();
  }

  function startListening() {
    if (!Recognition) {
      setMicStatus('micUnsupported');
      return;
    }
    if (!readJson(CONSENT_KEY)) {
      if (!window.confirm(t('micConsent'))) return;
      writeJson(CONSENT_KEY, true);
    }
    recognition = new Recognition();
    recognition.lang = VOICE_LANG[App.lang()] || 'de-DE';
    recognition.interimResults = true;
    recognition.continuous = true;
    const before = el.hearingInput.value ? el.hearingInput.value.trim() + ' ' : '';

    recognition.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalText) {
        // A finished sentence is sent right away; the box keeps only what is still being said.
        send('hearing', (before + finalText).trim(), 'speech');
        el.hearingInput.value = '';
      } else {
        el.hearingInput.value = before + interim;
      }
    };
    recognition.onerror = (event) => {
      setMicStatus(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'micDenied' : 'micError');
    };
    recognition.onend = () => {
      listening = false;
      updateMicButton();
      if (el.micStatus.dataset.key === 'micListening') setMicStatus('');
    };
    try {
      recognition.start();
      listening = true;
      setMicStatus('micListening');
    } catch (e) {
      setMicStatus('micError');
    }
    updateMicButton();
  }

  // ---- Wiring ----

  function bind() {
    bindComposer(el.hearingInput, el.hearingSend, 'hearing');
    bindComposer(el.deafInput, el.deafSend, 'deaf');
    el.hearingMic.addEventListener('click', () => (listening ? stopListening() : startListening()));
    el.deafFromSign.addEventListener('click', () => {
      const signed = App.signedText().trim();
      if (!signed) {
        App.showTab('sign');
        return;
      }
      if (send('deaf', signed, 'sign')) App.clearSignedText();
    });
    el.speakAgain.addEventListener('click', () => {
      const last = conversation.last();
      if (last) speak(last.text);
    });
    el.fingerspell.addEventListener('click', () => {
      const last = conversation.last();
      if (last) App.playText(last.text);
    });
    el.dgs.addEventListener('click', () => (dgsResult ? closeDgs() : openDgs()));
    el.historyClear.addEventListener('click', () => {
      if (!window.confirm(t('historyClearConfirm'))) return;
      conversation.clear();
      if (dgsResult) closeDgs();
      render();
    });
    el.historyCopy.addEventListener('click', async () => {
      const text = conversation.toTranscript({ hearing: t('sideHearing'), deaf: t('sideDeaf') });
      try {
        await navigator.clipboard.writeText(text);
        el.historyStatus.textContent = t('copied');
      } catch (e) {
        el.historyStatus.textContent = t('copyFailed');
      }
    });
    el.autoSpeak.addEventListener('change', () => changeSettings({ autoSpeak: el.autoSpeak.checked }));
    el.contrast.addEventListener('change', () => changeSettings({ contrast: el.contrast.checked ? 'high' : 'normal' }));
    el.fontDown.addEventListener('click', () => changeSettings({ fontScale: Math.round((settings.fontScale - 0.1) * 10) / 10 }));
    el.fontUp.addEventListener('click', () => changeSettings({ fontScale: Math.round((settings.fontScale + 0.1) * 10) / 10 }));
    if (!canSpeak) el.autoSpeak.disabled = true;
    if (!Recognition) {
      el.hearingMic.disabled = true;
      setMicStatus('micUnsupported');
    }
  }

  function onLanguage() {
    renderPhrases();
    render();
    renderDgs();
    updateMicButton();
    if (el.micStatus.dataset.key) el.micStatus.textContent = t(el.micStatus.dataset.key);
    el.historyStatus.textContent = '';
    if (listening) stopListening(); // the recogniser's language is fixed when it starts
  }

  bind();
  applySettings();
  App.onLanguage(onLanguage);
  onLanguage();
})();
