import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeForCompare,
  sameWord,
  firstLetterMatches,
  consumeInput,
  checkAnswer,
  foldCase,
  isIgnorableInput,
} from '../../src/core/answer.js';

describe('normalization for comparison', () => {
  test('ignores case, punctuation, extra spaces and normalization form', () => {
    assert.equal(normalizeForCompare('  “Liberty,”  '), 'liberty');
    assert.equal(normalizeForCompare('Four   SCORE!'), 'four score');
    assert.equal(normalizeForCompare('Café'), normalizeForCompare('Café'));
    assert.equal(normalizeForCompare('soft­hyphen'), 'softhyphen');
    assert.equal(foldCase('STRASSE'), foldCase('straße'));
  });

  test('strict on the words themselves', () => {
    assert.equal(sameWord('Liberty,', 'liberty'), true);
    assert.equal(sameWord('I’ve', "i've"), true);
    assert.equal(sameWord('résumé', 'resume'), false);
    assert.equal(sameWord('nation', 'notion'), false);
    assert.equal(sameWord('भाषा', 'भाषा।'), true);
    assert.equal(sameWord('भाषा', 'भाष'), false);
    assert.equal(sameWord('', ''), false);
  });
});

describe('first-letter recall', () => {
  test('accepts the first letter in any case', () => {
    assert.equal(firstLetterMatches('l', 'Liberty'), true);
    assert.equal(firstLetterMatches('L', 'liberty'), true);
    assert.equal(firstLetterMatches('x', 'liberty'), false);
    assert.equal(firstLetterMatches('1', '1863'), true);
  });

  test('accepts the base letter of an accented or conjunct first letter', () => {
    assert.equal(firstLetterMatches('e', 'Élan'), true);
    assert.equal(firstLetterMatches('é', 'élan'), true);
    assert.equal(firstLetterMatches('é', 'elan'), false, 'an accent that is not in the word is wrong');
    assert.equal(firstLetterMatches('न', 'निज'), true);
    assert.equal(firstLetterMatches('नि', 'निज'), true);
    assert.equal(firstLetterMatches('ज', 'ज्ञान'), true);
    assert.equal(firstLetterMatches('ज्ञ', 'ज्ञान'), true);
    assert.equal(firstLetterMatches('क', 'निज'), false);
    assert.equal(firstLetterMatches('ಕ', 'ಕನ್ನಡ'), true);
    assert.equal(firstLetterMatches('ய', 'யாமறிந்த'), true);
    assert.equal(firstLetterMatches('ا', 'الخيل'), true);
    assert.equal(firstLetterMatches('و', 'والليل'), true);
    assert.equal(firstLetterMatches('古', '古池'), true);
    assert.equal(firstLetterMatches('ㅎ', '한국'), true);
  });

  test('punctuation and spaces are never answers', () => {
    assert.equal(firstLetterMatches(',', 'Liberty'), false);
    assert.equal(firstLetterMatches(' ', 'Liberty'), false);
    assert.equal(isIgnorableInput(' '), true);
    assert.equal(isIgnorableInput('"'), true);
    assert.equal(isIgnorableInput('a'), false);
  });

  test('consumeInput walks through expected words', () => {
    const words = ['Four', 'score', 'and', 'seven'];
    const at = (pos) => (offset) => words[pos + offset] ?? null;
    assert.deepEqual(consumeInput('f', at(0)), ['ok']);
    assert.deepEqual(consumeInput('x', at(0)), ['wrong']);
    assert.deepEqual(consumeInput('fsa', at(0)), ['ok', 'ok', 'ok']);
    assert.deepEqual(consumeInput('f s', at(0)), ['ok', 'skip', 'ok']);
    assert.deepEqual(consumeInput('fxs', at(0)), ['ok', 'wrong', 'ok']);
    // stops at the end of the pattern
    assert.deepEqual(consumeInput('ssss', at(3)), ['ok']);
  });

  test('an input method may commit whole words (Japanese)', () => {
    const words = ['古池', 'や', '蛙', '飛び込む'];
    const at = (offset) => words[offset] ?? null;
    assert.deepEqual(consumeInput('古池や', at), ['ok', 'ok']);
    const later = (offset) => words[3 + offset] ?? null;
    assert.deepEqual(consumeInput('飛び込む', later), ['ok']);
  });
});

describe('checking a full answer', () => {
  const expected = ['Four', 'score', 'and', 'seven', 'years', 'ago'];

  test('tolerant of case, punctuation, spacing and normalization', () => {
    const r = checkAnswer(expected, '  four, SCORE and seven years   ago! ');
    assert.equal(r.correct, true);
    assert.deepEqual(r.marks, [true, true, true, true, true, true]);
  });

  test('wrong words are rejected', () => {
    const r = checkAnswer(expected, 'four score and eight years ago');
    assert.equal(r.correct, false);
    assert.deepEqual(r.marks, [true, true, true, false, true, true]);
    assert.deepEqual(r.extra, ['eight']);
  });

  test('missing and extra words are aligned, not shifted', () => {
    const r = checkAnswer(expected, 'four score seven years ago');
    assert.deepEqual(r.marks, [true, true, false, true, true, true]);
    const r2 = checkAnswer(expected, 'four score and and seven years ago');
    assert.deepEqual(r2.marks, [true, true, true, true, true, true]);
    assert.equal(r2.correct, false);
  });

  test('non-Latin scripts', () => {
    const hi = checkAnswer(['निज', 'भाषा', 'उन्नति'], 'निज भाषा, उन्नति।', { lang: 'hi' });
    assert.equal(hi.correct, true);
    const ar = checkAnswer(['الخيل', 'والليل'], 'الخيل والنهار', { lang: 'ar' });
    assert.deepEqual(ar.marks, [true, false]);
  });
});
