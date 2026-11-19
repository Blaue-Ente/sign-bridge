/*
 * DGS phrase catalogue: whole German sentences mapped to recorded DGS video clips.
 *
 * A sentence is matched as a whole (ignoring case, spacing and end punctuation, plus listed
 * variants). Nothing is translated word by word. A clip is only returned when its language
 * check by a DGS signer AND its publishing rights are both 'approved'.
 *
 * Entry: { phraseId, text, variants?, video, review: { language, publish }, signer?, notes? }
 * lookup() returns { status: 'available' | 'missing' | 'unapproved', phraseId, video, entry }.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && !!module.exports;
  const api = factory();
  if (isNode) module.exports = api;
  else (root.SignBridge = root.SignBridge || {}).Phrases = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizePhraseText(text) {
    return String(text == null ? '' : text)
      .normalize('NFC')
      .toLocaleLowerCase('de-DE')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[\s.!?…,;:]+$/u, '')
      .trim();
  }

  const isApproved = (entry) =>
    !!entry.review && entry.review.language === 'approved' && entry.review.publish === 'approved';

  function resultFor(entry) {
    if (!entry) return { status: 'missing', phraseId: null, video: null, entry: null };
    if (!entry.video) return { status: 'missing', phraseId: entry.phraseId, video: null, entry };
    if (!isApproved(entry)) return { status: 'unapproved', phraseId: entry.phraseId, video: null, entry };
    return { status: 'available', phraseId: entry.phraseId, video: entry.video, entry };
  }

  function createPhraseCatalog(entries) {
    const byId = new Map();
    const byText = new Map();
    for (const entry of entries || []) {
      if (!entry || !entry.phraseId) throw new Error('Phrase entry without phraseId');
      if (byId.has(entry.phraseId)) throw new Error('Duplicate phraseId: ' + entry.phraseId);
      byId.set(entry.phraseId, entry);
      for (const text of [entry.text].concat(entry.variants || [])) {
        const key = normalizePhraseText(text);
        if (!key) continue;
        if (byText.has(key)) throw new Error('Duplicate phrase text: ' + text);
        byText.set(key, entry);
      }
    }
    return {
      lookup: (text) => resultFor(byText.get(normalizePhraseText(text))),
      byId: (id) => resultFor(byId.get(id)),
      size: () => byId.size,
      available: () => Array.from(byId.values()).filter((e) => resultFor(e).status === 'available'),
    };
  }

  return { createPhraseCatalog, normalizePhraseText };
});
