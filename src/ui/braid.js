// The braid: words drawn as beads, links as curved threads.
//
// Forward threads (word i → i+1) arc above the beads, backward threads
// (i+1 → i) arc below. When a recitation turns around on a word (jaṭā,
// ghana), the thread loops around that bead, so repeated patterns weave a
// braid. Beads wrap into rows; a thread crossing to the next row leaves at
// the row's end and re-enters at the start of the next. Right-to-left text is
// mirrored.

import { s, reducedMotion } from './dom.js';
import { unitText } from '../core/segment.js';

/** @typedef {import('../core/segment.js').Unit} Unit */
/** @typedef {import('../core/patterns.js').Token} Token */
/** @typedef {'strong'|'shaky'|'weak'|'new'} Status */

const PILL_H = 40;
const PAD_X = 14;
const MIN_W = 42;
const GAP = 20;
const MARGIN = 16;

/** Room above and below each row for arcs, by the density of the pattern. */
const ARC_ROOM = { samhita: 26, pada: 14, krama: 26, jata: 34, ghana: 46, check: 30 };

/** @type {CanvasRenderingContext2D|null} */
let measureCtx = null;

/**
 * @param {string} text
 * @param {string} font  CSS font shorthand
 */
function textWidth(text, font) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 9;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/**
 * @typedef {Object} Bead
 * @property {number} item
 * @property {number} x  left edge
 * @property {number} y  top edge
 * @property {number} w
 * @property {number} cx
 * @property {number} row
 * @property {SVGGElement} el
 */

/**
 * @typedef {Object} BraidOptions
 * @property {Unit[]} units        all units of the text
 * @property {number[]} items      word indices shown, in order (contiguous)
 * @property {'ltr'|'rtl'} dir
 * @property {string} lang
 * @property {keyof typeof ARC_ROOM} [density]
 * @property {string} [label]      accessible description
 * @property {boolean} [hideWords] beads without their words
 */

/**
 * Create a braid inside a container. Call destroy() when done.
 * @param {HTMLElement} container
 * @param {BraidOptions} options
 */
export function createBraid(container, options) {
  const { units, items, dir, lang, density = 'krama', hideWords = false } = options;
  const rtl = dir === 'rtl';
  const room = ARC_ROOM[density] ?? 26;
  const rowPitch = PILL_H + room * 2 + 6;

  const svg = /** @type {SVGSVGElement} */ (
    s('svg', {
      class: 'braid',
      role: 'img',
      'aria-label': options.label || 'Braid of the words and their links',
      lang,
    })
  );
  const threads = /** @type {SVGGElement} */ (s('g', { class: 'threads' }));
  const beadsLayer = /** @type {SVGGElement} */ (s('g', { class: 'beads' }));
  svg.append(threads, beadsLayer);
  container.append(svg);

  /** @type {Map<number, Bead>} */
  const beads = new Map();
  let width = 0;
  /** Operations drawn so far, replayed after a re-layout. */
  /** @type {({ kind: 'link', index: number, dir: 'f'|'b', k: number, cls: string } | { kind: 'turn', item: number, side: 'end'|'start', k: number, cls: string })[]} */
  let ops = [];
  /** @type {Map<string, number>} */
  let passCount = new Map();
  /** @type {SVGGElement[]} */
  let fresh = [];

  for (const item of items) {
    const u = units[item];
    const label = hideWords ? '' : unitText(u);
    const g = /** @type {SVGGElement} */ (s('g', { class: 'bead', 'data-item': item }));
    g.append(
      s('rect', { class: 'bead-body', rx: PILL_H / 2, ry: PILL_H / 2, height: PILL_H }),
      s('text', { class: 'bead-text', 'dominant-baseline': 'central', 'text-anchor': 'middle', dir }, label),
    );
    beadsLayer.append(g);
    beads.set(item, { item, x: 0, y: 0, w: 0, cx: 0, row: 0, el: g });
  }

  function layout() {
    const available = Math.max(160, container.clientWidth || 320);
    width = available;
    const cs = getComputedStyle(svg);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let x = MARGIN;
    let row = 0;
    for (const item of items) {
      const b = /** @type {Bead} */ (beads.get(item));
      const label = hideWords ? '' : unitText(units[item]);
      const w = Math.max(MIN_W, Math.ceil(textWidth(label, font)) + PAD_X * 2);
      if (x > MARGIN && x + w > available - MARGIN) {
        row += 1;
        x = MARGIN;
      }
      b.w = Math.min(w, available - MARGIN * 2);
      b.x = rtl ? available - x - b.w : x;
      b.y = room + row * rowPitch;
      b.cx = b.x + b.w / 2;
      b.row = row;
      x += b.w + GAP;
      const rect = /** @type {SVGRectElement} */ (b.el.firstChild);
      rect.setAttribute('x', String(b.x));
      rect.setAttribute('y', String(b.y));
      rect.setAttribute('width', String(b.w));
      const text = /** @type {SVGTextElement} */ (b.el.lastChild);
      text.setAttribute('x', String(b.cx));
      text.setAttribute('y', String(b.y + PILL_H / 2));
    }
    const height = (row + 1) * rowPitch + 4;
    svg.setAttribute('viewBox', `0 0 ${available} ${height}`);
    svg.setAttribute('width', String(available));
    svg.setAttribute('height', String(height));
    // Redraw existing threads at their new positions, without animation.
    threads.replaceChildren();
    fresh = [];
    for (const op of ops) threads.append(drawOp(op));
  }

  /** @param {number} k */
  const arcHeight = (k) => 12 + Math.min(k, 5) * Math.max(2, (room - 16) / 5);

  /**
   * @param {number} index
   * @param {'f'|'b'} d
   * @param {number} k  earlier passes over this link in this direction
   */
  function linkPath(index, d, k) {
    const a = beads.get(index);
    const b = beads.get(index + 1);
    if (!a || !b) return '';
    const h = arcHeight(k);
    if (a.row === b.row) {
      if (d === 'f') {
        const y = a.y;
        return `M${a.cx},${y} C${a.cx},${y - h} ${b.cx},${y - h} ${b.cx},${y}`;
      }
      const y = a.y + PILL_H;
      return `M${b.cx},${y} C${b.cx},${y + h} ${a.cx},${y + h} ${a.cx},${y}`;
    }
    const endEdge = rtl ? 3 : width - 3;
    const startEdge = rtl ? width - 3 : 3;
    if (d === 'f') {
      const y1 = a.y;
      const y2 = b.y;
      return (
        `M${a.cx},${y1} C${a.cx},${y1 - h} ${endEdge},${y1 - h} ${endEdge},${y1 - h * 0.35} ` +
        `M${startEdge},${y2 - h * 0.35} C${startEdge},${y2 - h} ${b.cx},${y2 - h} ${b.cx},${y2}`
      );
    }
    const y1 = b.y + PILL_H;
    const y2 = a.y + PILL_H;
    return (
      `M${b.cx},${y1} C${b.cx},${y1 + h} ${startEdge},${y1 + h} ${startEdge},${y1 + h * 0.35} ` +
      `M${endEdge},${y2 + h * 0.35} C${endEdge},${y2 + h} ${a.cx},${y2 + h} ${a.cx},${y2}`
    );
  }

  /**
   * Loop around a bead where the recitation turns around.
   * @param {number} item
   * @param {'end'|'start'} side  'end': arrived moving forward, leaves backward
   * @param {number} k
   */
  function turnPath(item, side, k) {
    const b = beads.get(item);
    if (!b) return '';
    const bulge = 10 + Math.min(k, 4) * 3;
    const onRight = rtl ? side === 'start' : side === 'end';
    const out = onRight ? b.x + b.w + bulge : b.x - bulge;
    const top = b.y;
    const bottom = b.y + PILL_H;
    return side === 'end'
      ? `M${b.cx},${top} C${out},${top - 4} ${out},${bottom + 4} ${b.cx},${bottom}`
      : `M${b.cx},${bottom} C${out},${bottom + 4} ${out},${top - 4} ${b.cx},${top}`;
  }

  /** @param {typeof ops[number]} op */
  function drawOp(op) {
    const d = op.kind === 'link' ? linkPath(op.index, op.dir, op.k) : turnPath(op.item, op.side, op.k);
    const g = /** @type {SVGGElement} */ (s('g', { class: `thread ${op.cls}` }));
    g.append(s('path', { class: 'thread-casing', d }), s('path', { class: 'thread-core', d }));
    return g;
  }

  /**
   * @param {SVGGElement} g
   * @param {number} ms
   */
  function animateIn(g, ms) {
    if (!ms || reducedMotion()) return;
    for (const path of /** @type {NodeListOf<SVGPathElement>} */ (g.querySelectorAll('path'))) {
      let len = 0;
      try {
        len = path.getTotalLength();
      } catch {
        len = 0;
      }
      if (!len) continue;
      path.style.strokeDasharray = `${len} ${len}`;
      path.style.strokeDashoffset = String(len);
      path.getBoundingClientRect(); // commit the start state
      path.style.transition = `stroke-dashoffset ${ms}ms cubic-bezier(.45,.05,.35,1)`;
      path.style.strokeDashoffset = '0';
      setTimeout(() => {
        path.style.transition = '';
        path.style.strokeDasharray = '';
        path.style.strokeDashoffset = '';
      }, ms + 50);
    }
  }

  /** @param {typeof ops[number]} op @param {number} ms */
  function add(op, ms) {
    ops.push(op);
    const g = drawOp(op);
    threads.append(g);
    animateIn(g, ms);
    return g;
  }

  const api = {
    svg,
    layout,
    /** Remove all threads and highlights. */
    reset() {
      ops = [];
      passCount = new Map();
      fresh = [];
      threads.replaceChildren();
      for (const b of beads.values()) b.el.setAttribute('class', 'bead');
    },
    /**
     * Draw one pass over a link.
     * @param {number} index
     * @param {'f'|'b'} d
     * @param {number} [ms] animation duration
     */
    addLink(index, d, ms = 0) {
      const key = `${index}${d}`;
      const k = passCount.get(key) ?? 0;
      passCount.set(key, k + 1);
      const g = add({ kind: 'link', index, dir: d, k, cls: 'is-fresh' }, ms);
      fresh.push(g);
    },
    /**
     * Draw a turnaround loop.
     * @param {number} item
     * @param {'end'|'start'} side
     * @param {number} [ms]
     */
    addTurn(item, side, ms = 0) {
      const key = `t${item}${side}`;
      const k = passCount.get(key) ?? 0;
      passCount.set(key, k + 1);
      const g = add({ kind: 'turn', item, side, k, cls: 'is-fresh' }, ms);
      fresh.push(g);
    },
    /** Threads drawn so far stop being highlighted as new. */
    settle() {
      for (const g of fresh) g.classList.remove('is-fresh');
      fresh = [];
      for (const op of ops) op.cls = '';
    },
    /**
     * Mark the current bead.
     * @param {number|null} item
     */
    setCurrent(item) {
      for (const b of beads.values()) b.el.classList.toggle('is-current', b.item === item);
    },
    /**
     * A gentle pulse on a bead.
     * @param {number} item
     */
    pulse(item) {
      const b = beads.get(item);
      if (!b || reducedMotion()) return;
      b.el.classList.remove('is-pulse');
      b.el.getBoundingClientRect();
      b.el.classList.add('is-pulse');
    },
    /**
     * Draw results: one thread per practised direction of each link, coloured
     * by status, and beads outlined by word status.
     * @param {{ links: Map<number, { f?: Status, b?: Status }>, words: Map<number, Status> }} results
     */
    showResults(results) {
      api.reset();
      for (const [index, st] of results.links) {
        for (const d of /** @type {('f'|'b')[]} */ (['f', 'b'])) {
          const status = st[d];
          if (!status || status === 'new') continue;
          add({ kind: 'link', index, dir: d, k: 1, cls: `is-${status}` }, 0);
        }
      }
      for (const [item, status] of results.words) {
        const b = beads.get(item);
        if (b && status !== 'new') b.el.classList.add(`is-${status}`);
      }
    },
    destroy() {
      observer?.disconnect();
      svg.remove();
    },
  };

  /** @type {ResizeObserver|null} */
  let observer = null;
  let lastWidth = 0;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(() => {
      const w = container.clientWidth;
      if (w && Math.abs(w - lastWidth) > 1) {
        lastWidth = w;
        layout();
      }
    });
    observer.observe(container);
  }
  layout();
  lastWidth = container.clientWidth;
  // Web fonts change word widths once loaded.
  document.fonts?.ready?.then(() => layout()).catch(() => {});
  return api;
}

/**
 * Draw the transition into token k of a pattern: a link thread when the word
 * follows its neighbour in the same segment, a loop when the recitation turns
 * around on the same word across a pause, nothing for a jump.
 * @param {ReturnType<typeof createBraid>} braid
 * @param {Token[]} tokens
 * @param {number} k
 * @param {number} [ms]
 */
export function drawTransition(braid, tokens, k, ms = 0) {
  const t = tokens[k];
  const p = tokens[k - 1];
  if (!t || !p) return;
  if (t.link) {
    braid.addLink(t.link.index, t.link.dir, ms);
    return;
  }
  if (t.pos === 0 && p.item === t.item && p.pos > 0) {
    const before = tokens[k - 2];
    const next = tokens[k + 1];
    const arrive = before ? Math.sign(p.item - before.item) : 0;
    const depart = next && next.step === t.step && next.seg === t.seg ? Math.sign(next.item - t.item) : 0;
    if (arrive && depart && arrive !== depart) braid.addTurn(t.item, arrive > 0 ? 'end' : 'start', ms);
  }
}
