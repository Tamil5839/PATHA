// Checking answers: forgiving on case, punctuation, extra spaces and Unicode
// normalization; strict on the words themselves.

import { graphemes, segmentText } from './segment.js';

// Invisible formatting characters that should never decide an answer:
// soft hyphen, zero-width space/non-joiner/joiner, word joiner, BOM.
const IGNORABLE = /[­​-‍⁠﻿]/gu;
const PUNCT_OR_SYMBOL = /[\p{P}\p{S}]/gu;

/**
 * Case-fold a string (upper then lower handles ß/SS and final sigma).
 * @param {string} s
 */
export function foldCase(s) {
  return s.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC');
}

/**
 * Normalize a word or phrase for comparison: NFC, no invisible formatting
 * characters, no punctuation or symbols, single spaces, case-folded.
 * Diacritics and letters are kept exactly.
 * @param {string} s
 */
export function normalizeForCompare(s) {
  return foldCase(
    String(s ?? '')
      .normalize('NFC')
      .replace(IGNORABLE, '')
      .replace(PUNCT_OR_SYMBOL, ' ')
      .replace(/\s+/gu, ' ')
      .trim(),
  );
}

/**
 * Whether two words are the same, ignoring case, punctuation, spacing and
 * normalization form.
 * @param {string} a
 * @param {string} b
 */
export function sameWord(a, b) {
  const x = normalizeForCompare(a);
  return x.length > 0 && x === normalizeForCompare(b);
}

/**
 * Whether a typed character (one grapheme) may stand for the first letter
 * of a word. It must be the word's first letter, ignoring case. For
 * convenience, the base letter is also accepted when the first letter
 * carries an accent or is a conjunct: "e" for "élan", "न" for "नि",
 * "ज" for "ज्ञान", the jamo "ㅎ" for "한".
 * @param {string} typed
 * @param {string} word
 */
export function firstLetterMatches(typed, word) {
  const t = foldCase(typed.replace(IGNORABLE, ''));
  if (!t || /^[\s\p{P}]+$/u.test(t)) return false;
  const first = firstGrapheme(foldCase(word.replace(IGNORABLE, '')));
  if (!first) return false;
  if (first === t) return true;
  return first.normalize('NFKD').startsWith(t.normalize('NFKD'));
}

/** @param {string} s */
function firstGrapheme(s) {
  for (const g of graphemes(s)) {
    if (/[\p{L}\p{N}]/u.test(g.s)) return g.s;
  }
  return '';
}

/**
 * Whether typed input should be ignored in first-letter mode (spaces and
 * punctuation are never wrong answers).
 * @param {string} typed
 */
export function isIgnorableInput(typed) {
  return /^[\s\p{P}]*$/u.test(typed.replace(IGNORABLE, ''));
}

/**
 * Match the start of some typed input against one expected word,
 * first-letter style. An input method may commit several characters at once,
 * or a whole word (e.g. Japanese): input that begins with the whole expected
 * word counts as that word.
 * @param {string[]} input  typed graphemes, not empty
 * @param {string} word     the expected word
 * @returns {{ result: 'ok'|'wrong'|'skip', used: number }} outcome and how
 *   many graphemes of the input it used
 */
export function matchStep(input, word) {
  const g = input[0];
  if (isIgnorableInput(g)) return { result: 'skip', used: 1 };
  const wordGs = graphemes(word.normalize('NFC')).map((x) => x.s);
  const n = wordGs.length;
  if (n > 1 && input.length >= n && sameWord(input.slice(0, n).join(''), word)) return { result: 'ok', used: n };
  return { result: firstLetterMatches(g, word) ? 'ok' : 'wrong', used: 1 };
}

/**
 * Split typed input into graphemes.
 * @param {string} input
 */
export function typedGraphemes(input) {
  return graphemes(input.normalize('NFC')).map((g) => g.s);
}

/**
 * Consume typed input against a sequence of expected words (see matchStep).
 * @param {string} input
 * @param {(offset: number) => string|null} expectedAt  expected word at
 *   offset 0, 1, 2… from the current position, or null past the end
 * @returns {('ok'|'wrong'|'skip')[]} one entry per step; 'ok' advances to the
 *   next word, 'wrong' does not
 */
export function consumeInput(input, expectedAt) {
  /** @type {('ok'|'wrong'|'skip')[]} */
  const out = [];
  let gs = typedGraphemes(input);
  let offset = 0;
  while (gs.length) {
    const word = expectedAt(offset);
    if (word === null) break;
    const { result, used } = matchStep(gs, word);
    out.push(result);
    gs = gs.slice(used);
    if (result === 'ok') offset++;
  }
  return out;
}

/**
 * Compare a typed or spoken answer with the expected words.
 * Words are aligned (so a missing or extra word does not shift every word
 * after it) and each expected word is marked right or wrong.
 * @param {string[]} expected  expected words (cores)
 * @param {string} answer
 * @param {{ lang?: string }} [options]
 * @returns {{ correct: boolean, marks: boolean[], extra: string[] }}
 */
export function checkAnswer(expected, answer, { lang = 'en' } = {}) {
  const want = expected.map(normalizeForCompare);
  const got = segmentText(answer, { lang, mode: 'word' })
    .map((u) => normalizeForCompare(u.core))
    .filter(Boolean);
  // Longest common subsequence alignment of words.
  const m = want.length;
  const n = got.length;
  const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      L[i][j] = want[i] === got[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const marks = new Array(m).fill(false);
  const used = new Array(n).fill(false);
  for (let i = 0, j = 0; i < m && j < n; ) {
    if (want[i] === got[j]) {
      marks[i] = true;
      used[j] = true;
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const extra = got.filter((_, j) => !used[j]);
  return { correct: marks.every(Boolean) && extra.length === 0, marks, extra };
}
