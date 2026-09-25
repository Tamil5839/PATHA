// Home: the intro, your texts as palm-leaf cards, and samples.

import { h, add, icon, plural } from '../dom.js';
import * as store from '../store.js';
import { progressBraid, progressSummary, linkButton } from '../components.js';
import { passageStates } from '../../core/progress.js';
import { dayNumber } from '../../core/scheduler.js';
import { languageLabel } from '../../core/lang.js';
import { SAMPLES } from '../../core/samples.js';
import { link } from '../router.js';
import { nextPractice } from '../plan.js';

/** @param {HTMLElement} root */
export function renderHome(root) {
  const texts = store.allTexts();
  const today = dayNumber();

  const intro = h(
    'section',
    { class: `hero${texts.length ? ' hero-compact' : ''}` },
    h('p', { class: 'eyebrow' }, 'Patha · पाठ · recitation'),
    h('h1', null, 'A 3,000-year-old tradition of word-perfect memory'),
    h(
      'p',
      { class: 'lede' },
      'For around three thousand years, the Vedas have been passed down by heart, word for word. Reciters learn each passage in patterns that weave every word to its neighbours, forward and backward, so that a slip stands out at once. Patha lets you practise any text you want to know by heart with those same patterns.',
    ),
    texts.length
      ? null
      : h(
          'div',
          { class: 'hero-actions' },
          linkButton('Add a text', '#/add', { kind: 'primary', icon: 'plus' }),
          linkButton('How it works', '#/about', { kind: 'quiet' }),
        ),
  );

  const cards = texts.map((text) => card(text, today));

  add(
    root,
    intro,
    texts.length
      ? h(
          'section',
          { class: 'texts', 'aria-labelledby': 'texts-heading' },
          h('div', { class: 'section-head' }, h('h2', { id: 'texts-heading' }, 'Your texts'), linkButton('Add a text', '#/add', { kind: 'primary', icon: 'plus' })),
          h('ul', { class: 'card-grid', role: 'list' }, cards.map((c) => h('li', null, c))),
        )
      : null,
    samples(texts.length > 0),
  );
}

/**
 * @param {import('../../core/textModel.js').Text} text
 * @param {number} today
 */
function card(text, today) {
  const progress = store.getProgress(text.id);
  const states = passageStates(progress, text.passages, today);
  const due = states.filter((s) => s.due).length;
  const woven = states.filter((s) => s.stage === 'woven').length;
  const started = states.filter((s) => s.stage !== 'new').length;
  const next = nextPractice(text, progress, today);
  const bits = [];
  if (due) bits.push(h('span', { class: 'pill pill-due' }, `${due} due today`));
  if (woven) bits.push(h('span', { class: 'pill pill-woven' }, `${woven} woven`));
  if (!started) bits.push(h('span', { class: 'pill' }, 'Not started'));
  return h(
    'article',
    { class: 'leaf-card' },
    h('h3', { class: 'leaf-title' }, h('a', { href: link(['text', text.id]), lang: text.lang, dir: 'auto' }, text.title)),
    h(
      'p',
      { class: 'leaf-meta' },
      `${languageLabel(text.lang).split(' · ')[0]} · ${plural(text.units.length, 'word')} · ${plural(text.passages.length, 'passage')}`,
    ),
    h('div', { class: 'leaf-braid' }, progressBraid(text, progress)),
    h('p', { class: 'leaf-status' }, bits.length ? bits : h('span', { class: 'muted' }, progressSummary(text, progress))),
    h(
      'div',
      { class: 'leaf-actions' },
      linkButton(next.label, next.href, { kind: 'primary', icon: 'play' }),
      linkButton('Open', link(['text', text.id]), { kind: 'quiet', attrs: { 'aria-label': `Open ${text.title}` } }),
    ),
  );
}

/** @param {boolean} compact */
function samples(compact) {
  return h(
    'section',
    { class: `samples${compact ? ' samples-compact' : ''}`, 'aria-labelledby': 'samples-heading' },
    h('h2', { id: 'samples-heading' }, compact ? 'More to try' : 'Try a sample'),
    h('p', { class: 'muted' }, 'Short public-domain pieces in several scripts. Add one to see how the patterns work, then paste your own text.'),
    h(
      'ul',
      { class: 'sample-list', role: 'list' },
      SAMPLES.map((s) =>
        h(
          'li',
          null,
          h(
            'a',
            { class: 'sample', href: link(['add'], { sample: s.id }) },
            h('span', { class: 'sample-title mem', lang: s.lang }, s.title),
            h('span', { class: 'sample-source' }, s.source.replace(/ Public domain\..*$/, '')),
            icon('arrow'),
          ),
        ),
      ),
    ),
  );
}
