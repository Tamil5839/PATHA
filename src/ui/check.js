// CHECK: the braid with every link coloured by performance:
// strong (gold, solid), shaky (amber, dashed), weak (red, dotted).
// Colour is never the only signal: line styles differ, and the same
// information is listed as text.

import { h, s } from './dom.js';
import { createBraid } from './braid.js';
import { statusOf } from '../core/memory.js';

/** @typedef {import('../core/textModel.js').Text} Text */
/** @typedef {import('../core/memory.js').RoundResults} RoundResults */
/** @typedef {import('../core/memory.js').MemoryRecord} MemoryRecord */
/** @typedef {import('../core/memory.js').Status} Status */

const STATUS_TEXT = { strong: 'strong', shaky: 'shaky', weak: 'weak', new: 'not practised' };

/**
 * Link and word statuses for a set of words, from one round or all-time.
 * @param {number[]} items
 * @param {{ round?: RoundResults|null, memory?: MemoryRecord|null }} source
 */
export function statuses(items, { round = null, memory = null }) {
  /** @type {Map<number, { f?: Status, b?: Status }>} */
  const links = new Map();
  /** @type {Map<number, Status>} */
  const words = new Map();
  const inRange = new Set(items);
  if (round) {
    for (const l of round.links) {
      if (!inRange.has(l.index) || !inRange.has(l.index + 1)) continue;
      const entry = links.get(l.index) ?? {};
      entry[l.dir] = statusOf(l.score);
      links.set(l.index, entry);
    }
    for (const w of round.words) if (inRange.has(w.item)) words.set(w.item, statusOf(w.score));
  } else if (memory) {
    for (let i = 0; i + 1 < items.length; i++) {
      const index = items[i];
      const e = memory.links[index];
      if (!e) continue;
      links.set(index, { f: e.f ? statusOf(e.f.s) : undefined, b: e.b ? statusOf(e.b.s) : undefined });
    }
    for (const item of items) {
      const st = memory.words[item];
      if (st) words.set(item, statusOf(st.s));
    }
  }
  return { links, words };
}

/**
 * @param {HTMLElement} container
 * @param {{ text: Text, items: number[], links: Map<number, { f?: Status, b?: Status }>, words: Map<number, Status>, caption?: string }} options
 */
export function createCheckBraid(container, options) {
  const { text, items, links, words } = options;
  const host = h('div', { class: 'braid-host braid-check' });
  container.append(host);
  const summary = describe(text, links);
  const braid = createBraid(host, {
    units: text.units,
    items,
    dir: text.dir,
    lang: text.lang,
    density: 'check',
    label: options.caption ? `${options.caption}. ${summary}` : summary,
  });
  braid.showResults({ links, words });
  return braid;
}

/**
 * One-sentence summary of link statuses.
 * @param {Text} text
 * @param {Map<number, { f?: Status, b?: Status }>} links
 */
function describe(text, links) {
  const counts = { strong: 0, shaky: 0, weak: 0 };
  for (const e of links.values()) {
    for (const st of [e.f, e.b]) if (st && st !== 'new') counts[st]++;
  }
  return `${counts.strong} strong, ${counts.shaky} shaky and ${counts.weak} weak link directions.`;
}

/** The colour and line-style legend. */
export function legend() {
  const item = (/** @type {Status} */ st, /** @type {string} */ label) =>
    h(
      'li',
      null,
      s('svg', { class: `legend-swatch is-${st}`, viewBox: '0 0 36 12', 'aria-hidden': 'true', focusable: 'false' }, s('path', { d: 'M2 6 H34' })),
      label,
    );
  const list = h('ul', { class: 'legend', 'aria-label': 'Legend' }, item('strong', 'Strong'), item('shaky', 'Shaky'), item('weak', 'Weak'));
  return h('div', { class: 'legend-wrap' }, list, h('p', { class: 'legend-note' }, 'Threads above the words: forward. Below: backward.'));
}

/**
 * The same information as a list, for screen readers and for reading.
 * @param {Text} text
 * @param {number[]} items
 * @param {Map<number, { f?: Status, b?: Status }>} links
 */
export function linkList(text, items, links) {
  const rows = [];
  for (let i = 0; i + 1 < items.length; i++) {
    const index = items[i];
    const e = links.get(index);
    if (!e) continue;
    const a = text.units[index].core;
    const b = text.units[index + 1].core;
    const parts = [];
    if (e.f) parts.push(`forward ${STATUS_TEXT[e.f]}`);
    if (e.b) parts.push(`backward ${STATUS_TEXT[e.b]}`);
    const worst = [e.f, e.b].includes('weak') ? 'weak' : [e.f, e.b].includes('shaky') ? 'shaky' : 'strong';
    rows.push(
      h(
        'li',
        { class: `link-row is-${worst}` },
        h('span', { class: 'mem link-words', lang: text.lang, dir: text.dir }, a, ' — ', b),
        h('span', { class: 'link-status' }, parts.join(', ')),
      ),
    );
  }
  if (!rows.length) return h('p', { class: 'muted' }, 'No links practised here yet.');
  return h('details', { class: 'link-details' }, h('summary', null, 'Every link, in words'), h('ul', { class: 'link-list' }, rows));
}
