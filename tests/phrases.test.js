'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Phrases = require('../src/core/phrases.js');

const APPROVED = { language: 'approved', publish: 'approved' };

const catalog = () =>
  Phrases.createPhraseCatalog([
    { phraseId: 'wait-here', text: 'Bitte warten Sie hier.', variants: ['Warten Sie bitte hier!'], video: 'media/dgs/wait-here.mp4', review: APPROVED },
    { phraseId: 'pending', text: 'Einen Moment bitte.', video: 'media/dgs/moment.mp4', review: { language: 'approved', publish: 'pending' } },
    { phraseId: 'no-video', text: 'Guten Tag!', video: null, review: APPROVED },
  ]);

test('an approved clip is found by its text', () => {
  const r = catalog().lookup('Bitte warten Sie hier.');
  assert.equal(r.status, 'available');
  assert.equal(r.phraseId, 'wait-here');
  assert.equal(r.video, 'media/dgs/wait-here.mp4');
});

test('matching ignores case, spacing and end punctuation, and accepts listed variants', () => {
  assert.equal(catalog().lookup('  bitte WARTEN sie hier ').status, 'available');
  assert.equal(catalog().lookup('Warten Sie bitte hier.').phraseId, 'wait-here');
});

test('text without a catalogue entry is missing', () => {
  const r = catalog().lookup('Wo ist der Bahnhof?');
  assert.equal(r.status, 'missing');
  assert.equal(r.video, null);
});

test('a phrase without a video file is missing', () => {
  assert.equal(catalog().lookup('Guten Tag!').status, 'missing');
});

test('a clip whose language check or publishing rights are not approved is never returned', () => {
  const r = catalog().lookup('Einen Moment bitte.');
  assert.equal(r.status, 'unapproved');
  assert.equal(r.video, null);
});

test('word-by-word matching is not done: part of a phrase is missing', () => {
  assert.equal(catalog().lookup('Bitte warten').status, 'missing');
  assert.equal(catalog().lookup('Bitte warten Sie hier. Danke.').status, 'missing');
});

test('phrases can be looked up by their stable id', () => {
  assert.equal(catalog().byId('wait-here').status, 'available');
  assert.equal(catalog().byId('nope').status, 'missing');
});

test('duplicate ids or texts are rejected', () => {
  assert.throws(() =>
    Phrases.createPhraseCatalog([
      { phraseId: 'a', text: 'Ja.', video: null, review: APPROVED },
      { phraseId: 'a', text: 'Nein.', video: null, review: APPROVED },
    ])
  );
  assert.throws(() =>
    Phrases.createPhraseCatalog([
      { phraseId: 'a', text: 'Ja.', video: null, review: APPROVED },
      { phraseId: 'b', text: 'ja', video: null, review: APPROVED },
    ])
  );
});
