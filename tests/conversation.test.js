'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Conversation = require('../src/core/conversation.js');

test('a message keeps who wrote it, how, and the trimmed text', () => {
  const c = Conversation.createConversation();
  const m = c.add('hearing', '  Hallo, wie geht es?  ', 'speech');
  assert.equal(m.from, 'hearing');
  assert.equal(m.via, 'speech');
  assert.equal(m.text, 'Hallo, wie geht es?');
  assert.deepEqual(c.list().map((x) => x.text), ['Hallo, wie geht es?']);
});

test('empty or whitespace-only messages are ignored', () => {
  const c = Conversation.createConversation();
  assert.equal(c.add('deaf', '   ', 'typed'), null);
  assert.equal(c.list().length, 0);
});

test('an unknown speaker or input method is rejected', () => {
  const c = Conversation.createConversation();
  assert.throws(() => c.add('robot', 'x', 'typed'));
  assert.throws(() => c.add('deaf', 'x', 'telepathy'));
});

test('the history keeps only the newest messages', () => {
  const c = Conversation.createConversation({ max: 3 });
  for (const t of ['a', 'b', 'c', 'd']) c.add('deaf', t, 'typed');
  assert.deepEqual(c.list().map((x) => x.text), ['b', 'c', 'd']);
});

test('message ids are unique and increasing', () => {
  const c = Conversation.createConversation();
  const a = c.add('deaf', 'a', 'typed');
  const b = c.add('hearing', 'b', 'typed');
  assert.ok(b.id > a.id);
});

test('clear empties the history and last() is null afterwards', () => {
  const c = Conversation.createConversation();
  c.add('deaf', 'a', 'sign');
  assert.equal(c.last().text, 'a');
  c.clear();
  assert.equal(c.list().length, 0);
  assert.equal(c.last(), null);
});

test('the transcript names each speaker with the given labels', () => {
  const c = Conversation.createConversation({ now: () => new Date('2026-11-18T10:05:00') });
  c.add('hearing', 'Guten Tag', 'speech');
  c.add('deaf', 'Hallo', 'sign');
  const text = c.toTranscript({ hearing: 'Hörend', deaf: 'Gehörlos' });
  assert.equal(text, '[10:05] Hörend: Guten Tag\n[10:05] Gehörlos: Hallo');
});

test('quick phrases exist for both sides in German and English', () => {
  for (const lang of ['de', 'en']) {
    for (const side of ['hearing', 'deaf']) {
      const list = Conversation.PHRASES[lang][side];
      assert.ok(Array.isArray(list) && list.length >= 6, `${lang}/${side}`);
      for (const p of list) assert.ok(p.trim().length > 0);
    }
  }
});

test('settings are clamped to safe values', () => {
  assert.deepEqual(Conversation.normalizeSettings({}), { fontScale: 1, contrast: 'normal', autoSpeak: true, speechRate: 1 });
  const s = Conversation.normalizeSettings({ fontScale: 9, contrast: 'high', autoSpeak: false, speechRate: 0.1 });
  assert.equal(s.fontScale, 1.6);
  assert.equal(s.contrast, 'high');
  assert.equal(s.autoSpeak, false);
  assert.equal(s.speechRate, 0.6);
  assert.equal(Conversation.normalizeSettings({ contrast: 'neon' }).contrast, 'normal');
});
