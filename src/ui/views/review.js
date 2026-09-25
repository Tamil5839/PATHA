// Review: today's scheduled passages, weak-link drills, bridges to join,
// and where to continue learning.

import { h, plural } from '../dom.js';
import * as store from '../store.js';
import { linkButton, ladder, textSpan, unitsText } from '../components.js';
import { passageStates, reviewLevel, bridgesNeedingWork } from '../../core/progress.js';
import { dayNumber } from '../../core/scheduler.js';
import { LEVELS } from '../../core/patterns.js';
import { link } from '../router.js';
import { weakLinkCount } from '../plan.js';

/** Passages due (or to repeat) today across all texts. */
export function dueCount() {
  const today = dayNumber();
  let n = 0;
  for (const text of store.allTexts()) {
    for (const st of passageStates(store.getProgress(text.id), text.passages, today)) if (st.due || st.again) n++;
  }
  return n;
}

/** @param {HTMLElement} root */
export function renderReview(root) {
  const today = dayNumber();
  const texts = store.allTexts();
  /** @type {{ text: any, st: import('../../core/progress.js').PassageState }[]} */
  const due = [];
  /** @type {typeof due} */
  const again = [];
  /** @type {{ text: any, count: number }[]} */
  const weak = [];
  /** @type {{ text: any, p: number }[]} */
  const bridges = [];
  /** @type {{ text: any, st: import('../../core/progress.js').PassageState }[]} */
  const learning = [];
  /** @type {any[]} */
  const finals = [];

  for (const text of texts) {
    const progress = store.getProgress(text.id);
    const states = passageStates(progress, text.passages, today);
    for (const st of states) {
      if (st.due) due.push({ text, st });
      else if (st.again) again.push({ text, st });
    }
    const w = weakLinkCount(text, progress);
    if (w) weak.push({ text, count: w });
    for (const p of bridgesNeedingWork(progress, text.passages)) bridges.push({ text, p });
    const next = states.find((s) => s.stage === 'learning' && s.next !== 'ghana') ?? states.find((s) => s.stage === 'new');
    if (next) learning.push({ text, st: next });
    if (states.every((s) => s.stage !== 'new') && !progress.finals.some((f) => f.day === today)) finals.push(text);
  }

  // Most overdue first, then passages with the most weak links.
  due.sort((a, b) => b.st.overdue - a.st.overdue || b.st.weak - a.st.weak);

  const head = h(
    'header',
    { class: 'page-head' },
    h('h1', null, 'Review'),
    h(
      'p',
      { class: 'lede-sm' },
      texts.length
        ? due.length
          ? `${plural(due.length, 'passage')} due today. Reviews are spaced out further each time you recall a passage well, and brought back sooner when you stumble.`
          : 'Nothing is due right now. Reviews are spaced out further each time you recall a passage well.'
        : 'Add a text first; its passages will be scheduled here as you practise them.',
    ),
  );
  root.append(head);
  if (!texts.length) {
    root.append(h('p', null, linkButton('Add a text', '#/add', { kind: 'primary', icon: 'plus' })));
    return;
  }

  const section = (/** @type {string} */ id, /** @type {string} */ title, /** @type {Node[]} */ rows, /** @type {string} */ note = '') =>
    rows.length
      ? h('section', { class: 'review-section', 'aria-labelledby': id }, h('h2', { id }, title), note ? h('p', { class: 'muted' }, note) : null, h('ul', { class: 'review-list', role: 'list' }, rows))
      : null;

  const passageRow = (/** @type {{ text: any, st: any }} */ { text, st }, /** @type {string} */ badge) => {
    const level = reviewLevel(st.rec);
    const span = text.passages[st.index];
    const first = unitsText(text, span.start, Math.min(span.end, span.start + 6)).replace(/\n+/g, ' ');
    return h(
      'li',
      { class: 'review-row' },
      h(
        'div',
        { class: 'review-main' },
        h('p', { class: 'review-title' }, h('a', { href: link(['text', text.id]), lang: text.lang, dir: 'auto' }, text.title), ` · passage ${st.index + 1}`),
        textSpan(text, `${first}${span.end - span.start > 6 ? '…' : ''}`, 'review-snippet', 'p'),
        h('p', { class: 'review-meta' }, ladder(st.rec), h('span', { class: 'pill pill-due' }, badge), st.weak ? h('span', { class: 'muted' }, plural(st.weak, 'weak link')) : null),
      ),
      linkButton(`Recall · ${LEVELS.find((l) => l.id === level)?.name}`, link(['practice', text.id, st.index], { level, mode: 'recall' }), { kind: 'primary' }),
    );
  };

  const sections = [
    section(
      'due-heading',
      'Due today',
      due.map((d) => passageRow(d, d.st.overdue > 0 ? `${plural(d.st.overdue, 'day')} overdue` : 'Due today')),
    ),
    section('again-heading', 'One more pass today', again.map((d) => passageRow(d, 'Repeat')), 'These went less well earlier today. Spaced repetition works best when a shaky passage gets one more good pass the same day.'),
    section(
      'weak-heading',
      'Weak links',
      weak.map(({ text, count }) =>
        h(
          'li',
          { class: 'review-row' },
          h('div', { class: 'review-main' }, h('p', { class: 'review-title' }, h('a', { href: link(['text', text.id]), lang: text.lang, dir: 'auto' }, text.title)), h('p', { class: 'muted' }, `${plural(count, 'link')} that tripped you up recently.`)),
          linkButton('Drill', link(['drill', text.id]), { kind: 'secondary' }),
        ),
      ),
      'Mini jaṭā and ghana patterns built only around the words that trip you up.',
    ),
    section(
      'bridge-heading',
      'Bridges to join',
      bridges.slice(0, 12).map(({ text, p }) =>
        h(
          'li',
          { class: 'review-row' },
          h('div', { class: 'review-main' }, h('p', { class: 'review-title' }, h('a', { href: link(['text', text.id]), lang: text.lang, dir: 'auto' }, text.title), ` · passages ${p + 1} → ${p + 2}`)),
          linkButton('Practise bridge', link(['practice', text.id, `b${p}`], { level: 'jata', mode: 'recall' }), { kind: 'secondary' }),
        ),
      ),
      'The words where one passage meets the next, so the whole text holds together.',
    ),
    section(
      'learn-heading',
      'Keep learning',
      learning.map(({ text, st }) =>
        h(
          'li',
          { class: 'review-row' },
          h('div', { class: 'review-main' }, h('p', { class: 'review-title' }, h('a', { href: link(['text', text.id]), lang: text.lang, dir: 'auto' }, text.title), ` · passage ${st.index + 1}`), h('p', { class: 'review-meta' }, ladder(st.rec), h('span', { class: 'muted' }, st.stage === 'new' ? 'Not started' : `Next: ${LEVELS.find((l) => l.id === st.next)?.name}`))),
          linkButton(st.stage === 'new' ? 'Start' : 'Continue', link(['practice', text.id, st.index], { level: st.stage === 'new' ? 'samhita' : st.next, mode: st.stage === 'new' ? 'watch' : 'recall' }), { kind: 'secondary' }),
        ),
      ),
    ),
    section(
      'final-heading',
      'Final test',
      finals.map((text) =>
        h(
          'li',
          { class: 'review-row' },
          h('div', { class: 'review-main' }, h('p', { class: 'review-title' }, h('a', { href: link(['text', text.id]), lang: text.lang, dir: 'auto' }, text.title)), h('p', { class: 'muted' }, 'Every passage has been practised. Try the whole text in one go.')),
          linkButton('Final test', link(['final', text.id]), { kind: 'secondary' }),
        ),
      ),
    ),
  ].filter(Boolean);

  if (!due.length && !again.length) {
    root.append(h('div', { class: 'all-clear' }, h('p', { class: 'all-clear-title' }, 'All caught up.'), h('p', { class: 'muted' }, 'No reviews are due. Continue learning below, or come back tomorrow.')));
  }
  root.append(...sections);
}
