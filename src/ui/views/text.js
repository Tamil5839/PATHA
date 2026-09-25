// A text: its passages with their ladders, bridges between them, and the
// ways to practise it.

import { h, add, plural, relativeDay } from '../dom.js';
import * as store from '../store.js';
import { ladder, linkButton, button, confirmDialog, unitsText, textSpan, progressBraid } from '../components.js';
import { passageStates, bridgesNeedingWork, reviewLevel } from '../../core/progress.js';
import { linkStrength, statusOf } from '../../core/memory.js';
import { dayNumber } from '../../core/scheduler.js';
import { languageLabel } from '../../core/lang.js';
import { bridgeOf } from '../../core/textModel.js';
import { LEVELS } from '../../core/patterns.js';
import { go, link } from '../router.js';
import { nextPractice, weakLinkCount } from '../plan.js';

const STATUS_WORD = { strong: 'Strong join', shaky: 'Shaky join', weak: 'Weak join', new: 'Not joined yet' };

/**
 * @param {HTMLElement} root
 * @param {import('../router.js').Route} route
 */
export function renderText(root, route) {
  const text = store.getText(route.parts[0]);
  if (!text) throw new Error('not-found');
  const progress = store.getProgress(text.id);
  const today = dayNumber();
  const states = passageStates(progress, text.passages, today);
  const next = nextPractice(text, progress, today);
  const weak = weakLinkCount(text, progress);
  const bridges = new Set(bridgesNeedingWork(progress, text.passages));
  const woven = states.filter((s) => s.stage === 'woven').length;
  const due = states.filter((s) => s.due).length;
  const lastFinal = progress.finals[progress.finals.length - 1];

  const head = h(
    'header',
    { class: 'page-head text-head' },
    h('p', { class: 'crumbs' }, h('a', { href: '#/' }, 'Texts')),
    h('h1', { lang: text.lang, dir: 'auto' }, text.title),
    text.source ? h('p', { class: 'muted source' }, text.source) : null,
    h('p', { class: 'meta' }, `${languageLabel(text.lang)} · ${plural(text.units.length, 'word')} · ${plural(text.passages.length, 'passage')}`),
    h('div', { class: 'text-braid' }, progressBraid(text, progress)),
    h(
      'ul',
      { class: 'stat-row', role: 'list' },
      h('li', null, h('strong', null, String(woven)), ` of ${text.passages.length} woven`),
      h('li', null, h('strong', null, String(due)), ' due today'),
      h('li', null, h('strong', null, String(weak)), weak === 1 ? ' weak link' : ' weak links'),
      lastFinal ? h('li', null, 'Final test ', h('strong', null, `${Math.round(lastFinal.accuracy * 100)}%`), ` ${relativeDay(lastFinal.day, today)}`) : null,
    ),
    h(
      'div',
      { class: 'action-row' },
      linkButton(next.label, next.href, { kind: 'primary', icon: 'play' }),
      weak ? linkButton(`Drill weak links (${weak})`, link(['drill', text.id]), { kind: 'secondary' }) : null,
      linkButton('Final test', link(['final', text.id]), { kind: 'secondary' }),
      linkButton('Edit', link(['edit', text.id]), { kind: 'quiet', icon: 'edit' }),
      button('Delete', {
        kind: 'quiet',
        icon: 'trash',
        onClick: async () => {
          const ok = await confirmDialog(`Delete “${text.title}” and all its progress? This cannot be undone.`, { confirm: 'Delete', danger: true });
          if (!ok) return;
          await store.deleteText(text.id);
          go([]);
        },
      }),
    ),
  );

  const list = h('ol', { class: 'passage-list', role: 'list' });
  const firstNew = states.findIndex((st) => st.stage === 'new');
  states.forEach((st, p) => {
    const span = text.passages[p];
    const status = st.stage === 'woven' ? 'Woven' : st.due ? 'Due today' : st.again ? 'Repeat today' : st.stage === 'new' ? 'New' : 'Learning';
    const nextReview = st.rec?.sr && !st.due ? `Next review ${relativeDay(st.rec.sr.due, today)}` : '';
    const level = st.due || st.stage === 'woven' ? reviewLevel(st.rec) : st.next;
    list.append(
      h(
        'li',
        { class: `passage-card stage-${st.stage}${st.due ? ' is-due' : ''}` },
        h('div', { class: 'passage-top' }, h('span', { class: 'passage-no' }, `Passage ${p + 1}`), ladder(st.rec), h('span', { class: `pill ${st.due ? 'pill-due' : st.stage === 'woven' ? 'pill-woven' : ''}` }, status)),
        textSpan(text, unitsText(text, span.start, span.end), 'passage-text', 'p'),
        h(
          'div',
          { class: 'passage-foot' },
          h('span', { class: 'muted' }, [nextReview, st.weak ? plural(st.weak, 'weak link') : ''].filter(Boolean).join(' · ')),
          h(
            'span',
            { class: 'passage-actions' },
            linkButton('Watch', link(['practice', text.id, p], { level, mode: 'watch' }), { kind: 'quiet' }),
            linkButton(`Recall · ${LEVELS.find((l) => l.id === level)?.name}`, link(['practice', text.id, p], { level, mode: 'recall' }), { kind: st.due || p === firstNew ? 'primary' : 'secondary' }),
          ),
        ),
      ),
    );
    const bridge = bridgeOf(text, p);
    if (bridge && st.stage === 'new' && states[p + 1].stage === 'new') {
      // Nothing to show yet: just the thread that will join the two passages.
      list.append(h('li', { class: 'bridge-row is-quiet', 'aria-hidden': 'true' }, h('span', { class: 'bridge-thread' })));
    } else if (bridge) {
      const st2 = statusOf(linkStrength(progress, span.end - 1));
      list.append(
        h(
          'li',
          { class: `bridge-row is-${st2}`, 'aria-label': `Bridge between passage ${p + 1} and ${p + 2}: ${STATUS_WORD[st2]}` },
          h('span', { class: 'bridge-thread', 'aria-hidden': 'true' }),
          h('span', { class: 'mem bridge-words', lang: text.lang, dir: text.dir }, '…', unitsText(text, bridge.start, bridge.end).replace(/\n+/g, ' '), '…'),
          h('span', { class: 'bridge-status' }, STATUS_WORD[st2]),
          bridges.has(p) || st2 !== 'new'
            ? linkButton('Practise bridge', link(['practice', text.id, `b${p}`], { level: 'jata', mode: 'recall' }), { kind: 'quiet' })
            : null,
        ),
      );
    }
  });

  add(
    root,
    head,
    h('section', { class: 'passages', 'aria-labelledby': 'passages-heading' }, h('h2', { id: 'passages-heading' }, 'Passages'), list),
    progress.finals.length
      ? h(
          'section',
          { class: 'finals', 'aria-labelledby': 'finals-heading' },
          h('h2', { id: 'finals-heading' }, 'Final tests'),
          h(
            'ul',
            { class: 'final-list', role: 'list' },
            progress.finals
              .slice(-5)
              .reverse()
              .map((f) => h('li', null, `${Math.round(f.accuracy * 100)}% · ${relativeDay(f.day, today)}`, f.missed.length ? ` · ${plural(f.missed.length, 'word')} missed` : ' · no words missed')),
          ),
        )
      : null,
  );
}
