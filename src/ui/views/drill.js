// Weak-link drill: mini jaṭā or ghana patterns built only around the
// weakest links and their neighbours, one small window at a time.

import { h, icon, plural } from '../dom.js';
import * as store from '../store.js';
import { linkButton, textSpan, unitsText, radioKeys } from '../components.js';
import { weakLinkWindows } from '../../core/drills.js';
import { range } from '../../core/patterns.js';
import { passageOfWord } from '../../core/textModel.js';
import { createRecall } from '../recall.js';
import { createSession, commitSession } from '../session.js';
import { createCheckBraid, statuses, legend } from '../check.js';
import { link } from '../router.js';

/**
 * @param {HTMLElement} root
 * @param {import('../router.js').Route} route
 */
export function renderDrill(root, route) {
  const text = store.getText(route.parts[0]);
  if (!text) throw new Error('not-found');
  const progress = store.getProgress(text.id);
  const n = text.units.length;
  const from = Number.isInteger(Number(route.params.from)) && route.params.from ? Number(route.params.from) : 0;
  const to = Number.isInteger(Number(route.params.to)) && route.params.to ? Number(route.params.to) : n;
  const settings = store.getSettings();
  /** @type {'jata'|'ghana'} */
  let level = route.params.level === 'jata' || route.params.level === 'ghana' ? route.params.level : settings.drillLevel;
  const { links, windows } = weakLinkWindows(progress, n, { from, to });

  root.append(
    h(
      'header',
      { class: 'page-head' },
      h('p', { class: 'crumbs' }, h('a', { href: '#/' }, 'Texts'), ' › ', h('a', { href: link(['text', text.id]), lang: text.lang, dir: 'auto' }, text.title)),
      h('h1', null, 'Weak-link drill'),
      windows.length
        ? h('p', { class: 'lede-sm' }, `Short patterns around your ${plural(links.length, 'weakest link')}, each with a word of context on either side.`)
        : null,
    ),
  );

  if (!windows.length) {
    root.append(
      h(
        'section',
        { class: 'empty-state' },
        h('p', null, 'No weak links right now. Links become weak or shaky when a recall round trips on them.'),
        h('p', null, linkButton('Back to the text', link(['text', text.id]), { kind: 'primary' })),
      ),
    );
    return;
  }

  const stage = h('section', { class: 'drill-stage' });
  root.append(stage);
  /** @type {{ destroy: () => void }|null} */
  let active = null;
  /** @type {{ window: {start: number, end: number}, results: import('../../core/memory.js').RoundResults, accuracy: number }[]} */
  const done = [];

  function intro() {
    stage.replaceChildren(
      radioKeys(h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'Pattern' },
        ...[['jata', 'Jaṭā · braided pairs'], ['ghana', 'Ghana · the full weave']].map(([v, label]) =>
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              class: 'segmented-option',
              'aria-checked': String(level === v),
              onclick: () => {
                level = /** @type {'jata'|'ghana'} */ (v);
                store.setSetting('drillLevel', level);
                intro();
              },
            },
            label,
          ),
        ),
      )),
      h(
        'ol',
        { class: 'window-list' },
        windows.map((w) => h('li', null, `Passage ${passageOfWord(text, w.start) + 1}: ${plural(w.end - w.start, 'word')}`)),
      ),
      h('p', null, h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => runWindow(0) }, 'Begin', icon('arrow'))),
    );
  }

  /** @param {number} w */
  function runWindow(w) {
    active?.destroy();
    stage.replaceChildren();
    const win = windows[w];
    const session = createSession({ text, kind: 'drill', level, windows: [win] });
    const before = Math.max(0, win.start - 3);
    const cue =
      win.start === 0
        ? h('span', null, 'From the beginning of the text.')
        : h('span', null, 'After ', textSpan(text, `…${unitsText(text, before, win.start).replace(/\n+/g, ' ')}`, 'cue-words'));
    stage.append(h('p', { class: 'drill-count' }, `Window ${w + 1} of ${windows.length}`));
    const host = h('div');
    stage.append(host);
    active = createRecall(host, {
      session,
      method: settings.recallMethod === 'speak' ? 'letters' : settings.recallMethod,
      methods: ['letters', 'tap'],
      cue,
      onMethodChange: (m) => store.setSetting('recallMethod', m),
      onFinish: (s) => {
        const { outcome } = commitSession(s);
        done.push({ window: win, results: outcome.results, accuracy: outcome.summary.accuracy });
        if (w + 1 < windows.length) runWindow(w + 1);
        else summary();
      },
    });
  }

  function summary() {
    active?.destroy();
    active = null;
    stage.replaceChildren();
    const mean = done.reduce((a, d) => a + d.accuracy, 0) / Math.max(1, done.length);
    stage.append(
      h('div', { class: 'outcome' }, h('p', { class: 'outcome-headline' }, mean >= 0.95 ? 'Those links hold now.' : 'Getting stronger.'), h('p', { class: 'outcome-stats' }, `${Math.round(mean * 100)}% across ${plural(done.length, 'window')}`)),
    );
    for (const d of done) {
      const items = range(d.window.start, d.window.end);
      const st = statuses(items, { round: d.results });
      const box = h('div', { class: 'drill-result' });
      stage.append(box);
      createCheckBraid(box, { text, items, links: st.links, words: st.words, caption: `Words ${d.window.start + 1} to ${d.window.end}` });
    }
    stage.append(
      legend(),
      h(
        'div',
        { class: 'action-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => location.reload() }, icon('restart'), h('span', null, 'Drill again')),
        linkButton('Back to the text', link(['text', text.id]), { kind: 'secondary' }),
      ),
    );
  }

  intro();
  return () => active?.destroy();
}
