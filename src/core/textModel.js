// Creating and updating stored texts.

import { normalizeText, segmentText, chooseJoiner } from './segment.js';
import { chunkUnits, bridgeSpan, clampMaxWords, DEFAULT_MAX_WORDS } from './chunk.js';
import { directionFor } from './lang.js';
import { range } from './patterns.js';

/** @typedef {import('./segment.js').Unit} Unit */
/** @typedef {import('./segment.js').UnitMode} UnitMode */
/** @typedef {import('./chunk.js').ChunkMode} ChunkMode */
/** @typedef {{ start: number, end: number }} Span */

/**
 * @typedef {Object} Text
 * @property {string} id
 * @property {string} title
 * @property {string} source   optional attribution
 * @property {string} raw      normalised text
 * @property {string} lang     BCP 47 tag
 * @property {'ltr'|'rtl'} dir
 * @property {UnitMode} unitMode
 * @property {string} joiner   separator between reordered units
 * @property {{ mode: ChunkMode, maxWords: number }} chunk
 * @property {Unit[]} units    stored so that word indices never shift, even
 *                             if a browser segments text differently
 * @property {Span[]} passages
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * A short random id.
 * @param {string} prefix
 */
export function newId(prefix = 't') {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Build a text record from user input.
 * @param {{
 *   id?: string, title?: string, source?: string, raw: string, lang?: string,
 *   unitMode?: UnitMode, chunk?: { mode?: ChunkMode, maxWords?: number }, now?: number
 * }} input
 * @returns {Text}
 */
export function createText(input) {
  const raw = normalizeText(input.raw);
  const lang = input.lang || 'en';
  const unitMode = input.unitMode || 'word';
  const chunk = {
    mode: input.chunk?.mode || 'sentence',
    maxWords: clampMaxWords(input.chunk?.maxWords ?? DEFAULT_MAX_WORDS),
  };
  const units = segmentText(raw, { lang, mode: unitMode });
  const now = input.now ?? Date.now();
  return {
    id: input.id || newId('t'),
    title: (input.title || '').trim() || defaultTitle(raw),
    source: (input.source || '').trim(),
    raw,
    lang,
    dir: directionFor(lang, raw),
    unitMode,
    joiner: chooseJoiner(units, unitMode),
    chunk,
    units,
    passages: chunkUnits(units, chunk),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Re-split a text into passages (units, and so link progress, are kept).
 * @param {Text} text
 * @param {{ mode: ChunkMode, maxWords: number }} chunk
 * @param {number} [now]
 * @returns {Text}
 */
export function rechunk(text, chunk, now = Date.now()) {
  const c = { mode: chunk.mode, maxWords: clampMaxWords(chunk.maxWords) };
  return { ...text, chunk: c, passages: chunkUnits(text.units, c), updatedAt: now };
}

/**
 * First few words of a text, as a fallback title.
 * @param {string} raw
 */
export function defaultTitle(raw) {
  const firstLine = raw.split('\n')[0] || '';
  const chars = [...firstLine];
  return chars.length > 40 ? `${chars.slice(0, 40).join('').trim()}…` : firstLine || 'Untitled';
}

/**
 * Word indices of passage p.
 * @param {Text} text
 * @param {number} p
 */
export function passageItems(text, p) {
  const s = text.passages[p];
  return s ? range(s.start, s.end) : [];
}

/**
 * The bridge between passage p and p + 1, or null for the last passage.
 * @param {Text} text
 * @param {number} p
 */
export function bridgeOf(text, p) {
  return bridgeSpan(text.passages, p);
}

/**
 * Index of the passage containing word i.
 * @param {Text} text
 * @param {number} i
 */
export function passageOfWord(text, i) {
  return text.passages.findIndex((s) => i >= s.start && i < s.end);
}
