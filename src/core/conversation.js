/*
 * Conversation between a hearing and a deaf person: message history, quick phrases and
 * display settings. No DOM access, so it can be tested in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SignBridge = root.SignBridge || {};
    root.SignBridge.Conversation = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SPEAKERS = ['hearing', 'deaf'];
  const METHODS = ['typed', 'speech', 'sign', 'phrase'];

  function createConversation(options) {
    const opts = options || {};
    const max = opts.max || 200;
    const now = opts.now || (() => new Date());
    let messages = [];
    let nextId = 1;

    return {
      add(from, text, via) {
        if (!SPEAKERS.includes(from)) throw new Error('Unknown speaker: ' + from);
        if (!METHODS.includes(via)) throw new Error('Unknown input method: ' + via);
        const clean = String(text || '').trim();
        if (!clean) return null;
        const message = { id: nextId++, from, via, text: clean, time: now() };
        messages.push(message);
        if (messages.length > max) messages = messages.slice(-max);
        return message;
      },
      list() {
        return messages.slice();
      },
      last() {
        return messages.length ? messages[messages.length - 1] : null;
      },
      clear() {
        messages = [];
      },
      // Plain-text transcript, one line per message: "[HH:MM] Label: text".
      toTranscript(labels) {
        const pad = (n) => String(n).padStart(2, '0');
        return messages
          .map((m) => `[${pad(m.time.getHours())}:${pad(m.time.getMinutes())}] ${labels[m.from]}: ${m.text}`)
          .join('\n');
      },
    };
  }

  // Short, frequent phrases. Tapping one sends it at once.
  const PHRASES = {
    de: {
      hearing: [
        'Guten Tag!',
        'Wie kann ich Ihnen helfen?',
        'Einen Moment bitte.',
        'Bitte schreiben Sie es hier auf.',
        'Haben Sie das verstanden?',
        'Können Sie das wiederholen?',
        'Ich verstehe.',
        'Vielen Dank, auf Wiedersehen!',
      ],
      deaf: [
        'Ich bin gehörlos.',
        'Bitte sprechen Sie langsam und deutlich.',
        'Bitte schreiben Sie es auf.',
        'Ich verstehe Sie nicht.',
        'Bitte wiederholen.',
        'Ja.',
        'Nein.',
        'Danke!',
        'Ich brauche Hilfe.',
        'Bitte rufen Sie einen Notruf (112).',
      ],
    },
    en: {
      hearing: [
        'Hello!',
        'How can I help you?',
        'One moment, please.',
        'Please write it here.',
        'Did you understand that?',
        'Could you repeat that?',
        'I understand.',
        'Thank you, goodbye!',
      ],
      deaf: [
        'I am deaf.',
        'Please speak slowly and clearly.',
        'Please write it down.',
        'I do not understand you.',
        'Please repeat.',
        'Yes.',
        'No.',
        'Thank you!',
        'I need help.',
        'Please call emergency services (112).',
      ],
    },
  };

  const DEFAULT_SETTINGS = { fontScale: 1, contrast: 'normal', autoSpeak: true, speechRate: 1 };
  const clamp = (v, lo, hi, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

  function normalizeSettings(raw) {
    const s = raw || {};
    return {
      fontScale: clamp(s.fontScale, 0.9, 1.6, DEFAULT_SETTINGS.fontScale),
      contrast: s.contrast === 'high' ? 'high' : 'normal',
      autoSpeak: typeof s.autoSpeak === 'boolean' ? s.autoSpeak : DEFAULT_SETTINGS.autoSpeak,
      speechRate: clamp(s.speechRate, 0.6, 1.4, DEFAULT_SETTINGS.speechRate),
    };
  }

  return { SPEAKERS, METHODS, PHRASES, DEFAULT_SETTINGS, createConversation, normalizeSettings };
});
