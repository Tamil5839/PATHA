// Final test: recite the whole text continuously (saṃhitā), typing only the
// first letter of each word. No hints; a revealed word counts as missed.

import { h, mount, icon, plural } from '../dom.js';
import * as store from '../store.js';
import { linkButton } from '../components.js';
import { createRecall } from '../recall.js';
import { createSession, commitSession } from '../session.js';
import { weakLinksIn } from '../../core/memory.js';
import { unitText } from '../../core/segment.js';
import { link } from '../router.js';

/**
 * @param {HTMLElement} root
 * @param {import('../router.js').Route} route
 */
export function renderFinal(root, route) {
  const text = store.getText(route.parts[0]);
  if (!text) throw new Error('not-found');
  const stage = h('section', { class: 'final-stage' });
  /** @type {{ destroy: () => void }|null} */
  let active = null;

  root.append(
    h(
      'header',
      { class: 'page-head' },
      h('p', { class: 'crumbs' }, h('a', { href: '#/' }, 'Texts'), ' › ', h('a', { href: link(['text', text.id]), lang: text.lang, dir: 'auto' }, text.title)),
      h('h1', null, 'Final test'),
      h(
        'p',
        { class: 'lede-sm' },
        `Recite the whole text, all ${plural(text.units.length, 'word')}, as one continuous saṃhitā recitation. Type the first letter of each word; the word appears when you start it correctly. There are no hints: a word you reveal counts as missed.`,
      ),
    ),
    stage,
  );

  function intro() {
    stage.replaceChildren(h('p', null, h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: begin }, 'Begin the final test', icon('arrow'))));
  }

  function begin() {
    stage.replaceChildren();
    const session = createSession({ text, kind: 'final', level: 'samhita' });
    active = createRecall(stage, {
      session,
      method: 'letters',
      methods: ['letters'],
      layout: 'flow',
      cue: h('span', null, 'From the beginning of ', h('em', { lang: text.lang, dir: 'auto' }, text.title), '.'),
      onFinish: (s) => {
        const { outcome } = commitSession(s);
        active?.destroy();
        active = null;
        results(outcome, s);
      },
    });
  }

  /**
   * @param {import('../../core/progress.js').RoundOutcome} outcome
   * @param {import('../session.js').Session} session
   */
  function results(outcome, session) {
    const { summary } = outcome;
    const pct = Math.round(summary.accuracy * 100);
    const missed = session.tokens.filter((_, k) => session.scores[k] === 0).map((t) => t.item);
    const perPassage = text.passages.map((span, i) => {
      const ks = session.tokens.map((t, k) => ({ t, k })).filter(({ t }) => t.item >= span.start && t.item < span.end);
      const answered = ks.filter(({ k }) => session.scores[k] !== null);
      const acc = answered.length ? answered.reduce((a, { k }) => a + /** @type {number} */ (session.scores[k]), 0) / answered.length : null;
      return { i, acc };
    });
    const weak = weakLinksIn(store.getProgress(text.id), 0, text.units.length).length;
    mount(
      stage,
      h(
        'div',
        { class: 'outcome' },
        h('p', { class: 'outcome-headline' }, summary.perfect ? 'The whole text, word-perfect.' : pct >= 90 ? 'Nearly all of it, in order.' : 'A clear picture of what to practise next.'),
        h('p', { class: 'outcome-stats' }, `${summary.got} of ${summary.total} words right first time · ${summary.unsure} unsure · ${summary.missed} missed · ${pct}%`),
      ),
      h(
        'section',
        { 'aria-labelledby': 'pp-heading' },
        h('h2', { id: 'pp-heading' }, 'By passage'),
        h(
          'ol',
          { class: 'bar-list' },
          perPassage.map(({ i, acc }) =>
            h(
              'li',
              null,
              h('span', { class: 'bar-label' }, `Passage ${i + 1}`),
              h('span', { class: 'bar', role: 'img', 'aria-label': acc === null ? 'not reached' : `${Math.round(acc * 100)}%` }, h('span', { class: 'bar-fill', style: { width: `${Math.round((acc ?? 0) * 100)}%` } })),
              h('span', { class: 'bar-value' }, acc === null ? '—' : `${Math.round(acc * 100)}%`),
            ),
          ),
        ),
      ),
      missed.length
        ? h(
            'section',
            { 'aria-labelledby': 'missed-heading' },
            h('h2', { id: 'missed-heading' }, 'Words you missed'),
            h(
              'ul',
              { class: 'missed-list' },
              missed.slice(0, 50).map((i) => {
                const sep = text.joiner || ' ';
                return h(
                  'li',
                  null,
                  h(
                    'span',
                    { class: 'mem missed-context', lang: text.lang, dir: text.dir },
                    text.units[i - 1] ? `${unitText(text.units[i - 1])}${sep}` : '',
                    h('mark', null, unitText(text.units[i])),
                    text.units[i + 1] ? `${sep}${unitText(text.units[i + 1])}` : '',
                  ),
                );
              }),
            ),
          )
        : null,
      h(
        'div',
        { class: 'action-row' },
        weak ? linkButton(`Drill weak links (${weak})`, link(['drill', text.id]), { kind: 'primary' }) : null,
        h('button', { type: 'button', class: `btn ${weak ? 'btn-secondary' : 'btn-primary'}`, onclick: intro }, icon('restart'), h('span', null, 'Take it again')),
        linkButton('Back to the text', link(['text', text.id]), { kind: 'quiet' }),
      ),
    );
    stage.focus?.();
  }

  intro();
  return () => active?.destroy();
}
