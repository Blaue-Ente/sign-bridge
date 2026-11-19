/*
 * Optional word signs. Words listed here are signed with their own frames instead
 * of being fingerspelled. Each frame names a handshape from src/core/shapes.js and
 * how long to hold it in milliseconds. Keys are lower-case words.
 *
 * Example (illustrative only, not a real sign):
 *   window.SIGN_DICTIONARY = { 'hi': [{ shape: 'B', hold: 500 }] };
 *
 * The file ships empty: word signs must come from a verified sign-language source.
 */
window.SIGN_DICTIONARY = window.SIGN_DICTIONARY || {};
