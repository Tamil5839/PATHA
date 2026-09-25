// Small shared UI pieces.

import { h, s, icon } from './dom.js';
import { LEVELS } from '../core/patterns.js';
import { highestCleared, isWoven, getPassage } from '../core/progress.js';
import { linkStrength, statusOf } from '../core/memory.js';
import { joinUnits } from '../core/segment.js';

/** @typedef {import('../core/textModel.js').Text} Text */
/** @typedef {import('../core/progress.js').Progress} Progress */
/** @typedef {import('../core/progress.js').PassageRecord} PassageRecord */

/**
 * Text in the memorised language: serif, with its language and direction.
 * @param {Text} text
 * @param {string} content
 * @param {string} [cls]
 * @param {string} [tag]
 */
export function textSpan(text, content, cls = '', tag = 'span') {
  return h(tag, { class: `mem ${cls}`.trim(), lang: text.lang, dir: text.dir }, content);
}

/**
 * Continuous text of a range of units, with line breaks.
 * @param {Text} text
 * @param {number} start
 * @param {number} end
 */
export function unitsText(text, start, end) {
  return joinUnits(text.units.slice(start, end), text.joiner);
}

/**
 * The five-rung ladder of a passage (saṃhitā → ghana).
 * @param {PassageRecord|null} rec
 * @param {{ size?: 'sm'|'md' }} [options]
 */
export function ladder(rec, { size = 'sm' } = {}) {
  const rank = highestCleared(rec);
  const woven = isWoven(rec);
  const label = woven
    ? 'Woven: ghana recited without error on two days'
    : rank
      ? `Cleared up to ${LEVELS[rank - 1].name}`
      : 'No level cleared yet';
  return h(
    'span',
    { class: `ladder ladder-${size}${woven ? ' is-woven' : ''}`, role: 'img', 'aria-label': label, title: label },
    LEVELS.map((l) => h('span', { class: `rung${l.rank <= rank ? ' is-cleared' : ''}` })),
  );
}

/**
 * Mini braid for a text card: one bead per passage (filled by level, gold
 * when woven), threads between passages coloured by the strength of the link
 * across the boundary.
 * @param {Text} text
 * @param {Progress} progress
 */
export function progressBraid(text, progress) {
  const n = text.passages.length;
  const w = 300;
  const hgt = 28;
  const pad = 10;
  const step = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const r = Math.max(3, Math.min(7, step / 3 || 7));
  const svg = s('svg', {
    class: 'mini-braid',
    viewBox: `0 0 ${w} ${hgt}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': progressSummary(text, progress),
  });
  const cy = hgt / 2;
  const x = (/** @type {number} */ i) => (n > 1 ? pad + i * step : w / 2);
  const flip = text.dir === 'rtl';
  const X = (/** @type {number} */ i) => (flip ? w - x(i) : x(i));
  for (let i = 0; i + 1 < n; i++) {
    const st = statusOf(linkStrength(progress, text.passages[i].end - 1));
    const x1 = X(i);
    const x2 = X(i + 1);
    const mid = (x1 + x2) / 2;
    svg.append(
      s('path', { class: `mb-thread is-${st}`, d: `M${x1},${cy} Q${mid},${cy - 9} ${x2},${cy}` }),
      s('path', { class: `mb-thread mb-back is-${st}`, d: `M${x1},${cy} Q${mid},${cy + 9} ${x2},${cy}` }),
    );
  }
  text.passages.forEach((span, i) => {
    const rec = getPassage(progress, span);
    const rank = highestCleared(rec);
    const woven = isWoven(rec);
    const cls = woven ? 'is-woven' : rank ? 'is-learning' : rec?.rounds ? 'is-started' : 'is-new';
    svg.append(s('circle', { class: `mb-bead ${cls}`, cx: X(i), cy, r, style: { '--level': String(rank / 5) } }));
  });
  return svg;
}

/**
 * @param {Text} text
 * @param {Progress} progress
 */
export function progressSummary(text, progress) {
  let woven = 0;
  let started = 0;
  for (const span of text.passages) {
    const rec = getPassage(progress, span);
    if (isWoven(rec)) woven++;
    else if (rec?.rounds) started++;
  }
  return `${woven} of ${text.passages.length} passages woven, ${started} in progress`;
}

/**
 * A button with an optional icon.
 * @param {string} label
 * @param {{ onClick?: (e: MouseEvent) => void, kind?: 'primary'|'secondary'|'quiet'|'danger', icon?: Parameters<typeof icon>[0], title?: string, type?: string, disabled?: boolean, attrs?: Record<string, any> }} [opts]
 */
export function button(label, opts = {}) {
  return h(
    'button',
    {
      type: opts.type || 'button',
      class: `btn btn-${opts.kind || 'secondary'}`,
      onclick: opts.onClick,
      title: opts.title,
      disabled: opts.disabled,
      ...opts.attrs,
    },
    opts.icon ? icon(opts.icon) : null,
    h('span', null, label),
  );
}

/**
 * A link styled as a button.
 * @param {string} label
 * @param {string} href
 * @param {{ kind?: 'primary'|'secondary'|'quiet', icon?: Parameters<typeof icon>[0], attrs?: Record<string, any> }} [opts]
 */
export function linkButton(label, href, opts = {}) {
  return h('a', { class: `btn btn-${opts.kind || 'secondary'}`, href, ...opts.attrs }, opts.icon ? icon(opts.icon) : null, h('span', null, label));
}

/**
 * Level name with its Devanagari form.
 * @param {import('../core/patterns.js').LevelId} id
 */
export function levelLabel(id) {
  const level = LEVELS.find((l) => l.id === id) ?? LEVELS[0];
  return h('span', { class: 'level-label' }, level.name, ' ', h('span', { class: 'deva', lang: 'sa' }, level.deva));
}

/**
 * A modest confirmation dialog built on <dialog>, with a fallback.
 * @param {string} message
 * @param {{ confirm?: string, cancel?: string, danger?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, opts = {}) {
  const dialog = /** @type {HTMLDialogElement} */ (h('dialog', { class: 'dialog' }));
  if (typeof dialog.showModal !== 'function') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    const close = (/** @type {boolean} */ value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.append(
      h('p', { class: 'dialog-message' }, message),
      h(
        'div',
        { class: 'dialog-actions' },
        button(opts.cancel || 'Cancel', { onClick: () => close(false), kind: 'quiet' }),
        button(opts.confirm || 'OK', { onClick: () => close(true), kind: opts.danger ? 'danger' : 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/**
 * Keyboard support for a group of role="radio" buttons: arrow keys move the
 * selection (and focus), and only the selected option is in the tab order.
 * Works with groups that re-render their options on change.
 * @param {HTMLElement} group  the element with role="radiogroup"
 */
export function radioKeys(group) {
  const radios = () => /** @type {HTMLElement[]} */ ([...group.querySelectorAll('[role=radio]')]);
  const syncTabIndex = () => {
    const all = radios();
    const checked = all.find((r) => r.getAttribute('aria-checked') === 'true') ?? all[0];
    for (const r of all) r.tabIndex = r === checked ? 0 : -1;
  };
  group.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = /** @type {Record<string, number>} */ (keys)[e.key];
    if (!step) return;
    const all = radios();
    const i = all.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (i === -1) return;
    e.preventDefault();
    const rtl = getComputedStyle(group).direction === 'rtl' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    const next = all[(i + (rtl ? -step : step) + all.length) % all.length];
    next.click();
    // The click may have re-rendered the group; find it again by its label.
    const label = group.getAttribute('aria-label');
    const live = group.isConnected ? group : /** @type {HTMLElement|null} */ (document.querySelector(`[role=radiogroup][aria-label="${label}"]`));
    const checked = live && /** @type {HTMLElement|null} */ (live.querySelector('[role=radio][aria-checked=true]'));
    checked?.focus();
  });
  new MutationObserver(syncTabIndex).observe(group, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked'] });
  syncTabIndex();
  return group;
}
