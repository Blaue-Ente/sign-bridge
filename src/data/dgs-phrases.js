/*
 * DGS video phrases (see src/core/phrases.js).
 *
 * Every entry is one whole German sentence and one clip of a person signing it in DGS.
 * No clips are included yet, so the app shows "kein DGS-Video verfügbar" for every message.
 *
 * To add a clip:
 *   1. Record a DGS signer (hands, face and upper body in view), with written consent that
 *      covers showing the clip in this app (and, separately, any use for training).
 *   2. Put the file in media/dgs/ and set `video` to its path.
 *   3. Have a DGS signer check the clip, then set review.language to 'approved'.
 *   4. Once the publishing rights are settled, set review.publish to 'approved'.
 * Only entries with both reviews 'approved' and a video are ever shown.
 * Do not download clips from other sites into this folder.
 */
(function (root) {
  'use strict';

  const PENDING = { language: 'pending', publish: 'pending' };
  const entry = (phraseId, text, variants) => ({ phraseId, text, variants: variants || [], video: null, review: PENDING });

  root.DGS_PHRASES = [
    // Hearing person -> deaf person
    entry('greeting', 'Guten Tag!', ['Hallo!']),
    entry('how-can-i-help', 'Wie kann ich Ihnen helfen?'),
    entry('one-moment', 'Einen Moment bitte.', ['Einen Moment, bitte.']),
    entry('please-write-here', 'Bitte schreiben Sie es hier auf.'),
    entry('understood-question', 'Haben Sie das verstanden?'),
    entry('repeat-question', 'Können Sie das wiederholen?'),
    entry('i-understand', 'Ich verstehe.'),
    entry('thanks-goodbye', 'Vielen Dank, auf Wiedersehen!'),
    entry('wait-here', 'Bitte warten Sie hier.', ['Warten Sie bitte hier.']),
    // Deaf person -> hearing person (useful to show back, e.g. for confirmation)
    entry('i-am-deaf', 'Ich bin gehörlos.'),
    entry('speak-slowly', 'Bitte sprechen Sie langsam und deutlich.'),
    entry('write-it-down', 'Bitte schreiben Sie es auf.'),
    entry('i-do-not-understand', 'Ich verstehe Sie nicht.'),
    entry('please-repeat', 'Bitte wiederholen.'),
    entry('yes', 'Ja.'),
    entry('no', 'Nein.'),
    entry('thanks', 'Danke!'),
    entry('need-help', 'Ich brauche Hilfe.'),
    entry('call-emergency', 'Bitte rufen Sie einen Notruf (112).'),
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
