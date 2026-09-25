// Weak-link drills: mini jaṭā/ghana patterns built around the weakest links.

import { buildPattern, range } from './patterns.js';
import { weakLinksIn } from './memory.js';

/** @typedef {import('./memory.js').MemoryRecord} MemoryRecord */
/** @typedef {{ start: number, end: number }} Span */

/**
 * Choose the weakest practised links (below strong) of a text and build a
 * small window of words around each: the link's two words plus one
 * neighbour on each side. Windows that touch or overlap are merged while they
 * stay short, so each drill stays a quick, focused pattern.
 * @param {MemoryRecord} memory
 * @param {number} wordCount
 * @param {{ limit?: number, maxWindow?: number }} [options]
 * @returns {{ links: number[], windows: Span[] }}
 */
export function weakLinkWindows(memory, wordCount, { limit = 6, maxWindow = 6 } = {}) {
  const links = weakLinksIn(memory, 0, wordCount)
    .slice(0, limit)
    .map((l) => l.index)
    .sort((a, b) => a - b);
  /** @type {Span[]} */
  const windows = [];
  for (const i of links) {
    const w = { start: Math.max(0, i - 1), end: Math.min(wordCount, i + 3) };
    const last = windows[windows.length - 1];
    if (last && w.start <= last.end && Math.max(last.end, w.end) - last.start <= maxWindow) {
      last.end = Math.max(last.end, w.end);
    } else {
      windows.push(w);
    }
  }
  return { links, windows };
}

/**
 * The patterns of a weak-link drill, one per window.
 * @param {Span[]} windows
 * @param {'jata'|'ghana'} level
 */
export function drillPatterns(windows, level = 'ghana') {
  return windows.map((w) => ({ span: w, pattern: buildPattern(level, range(w.start, w.end)) }));
}
