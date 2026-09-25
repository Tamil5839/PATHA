// Practice a passage (or a bridge between passages): choose the level and
// the mode — Watch, Recall, Check.

import { h, icon, relativeDay, announce } from '../dom.js';
import * as store from '../store.js';
import { ladder, linkButton, textSpan, unitsText, levelLabel, radioKeys } from '../components.js';
import { LEVELS, buildPattern, tokenize, range, isLevelId, levelById } from '../../core/patterns.js';
import { getPassage, recommendedLevel, highestCleared, isWoven } from '../../core/progress.js';
import { weakLinksIn } from '../../core/memory.js';
import { dayNumber } from '../../core/scheduler.js';
import { bridgeOf } from '../../core/textModel.js';
import { createWatch } from '../watch.js';
import { createRecall } from '../recall.js';
import { createCheckBraid, statuses, legend, linkList } from '../check.js';
import { createSession, commitSession } from '../session.js';
import { canListen } from '../speech.js';
import { link } from '../router.js';

/** @typedef {import('../../core/patterns.js').LevelId} LevelId */
/** @typedef {'watch'|'recall'|'check'} Mode */

/**
 * Results of the latest round per passage and level, kept while the app is
 * open so that Check still shows them after switching tabs.
 * @type {Map<string, { results: import('../../core/memory.js').RoundResults, outcome: import('../../core/progress.js').RoundOutcome, rec: import('../../core/progress.js').PassageRecord|null, level: LevelId }>}
 */
const lastRounds = new Map();

/**
 * @param {HTMLElement} root
 * @param {import('../router.js').Route} route
 */
export function renderPractice(root, route) {
  const text = store.getText(route.parts[0]);
  if (!text) throw new Error('not-found');
  const target = route.parts[1] ?? '0';
  const isBridge = target.startsWith('b');
  const p = Number(isBridge ? target.slice(1) : target);
  if (!Number.isInteger(p)) throw new Error('not-found');
  const span = isBridge ? bridgeOf(text, p) : text.passages[p];
  if (!span) throw new Error('not-found');
  const items = range(span.start, span.end);
  const progress = store.getProgress(text.id);
  const recNow = () => (isBridge ? null : getPassage(progress, /** @type {any} */ (span)));

  /** @type {LevelId} */
  let level = isLevelId(route.params.level) ? /** @type {LevelId} */ (route.params.level) : isBridge ? 'jata' : recommendedLevel(recNow());
  /** @type {Mode} */
  let mode = /** @type {Mode} */ (['watch', 'recall', 'check'].includes(route.params.mode) ? route.params.mode : recNow()?.rounds ? 'recall' : 'watch');
  const key = () => `${text.id}|${target}|${level}`;

  /** @type {{ destroy: () => void }|null} */
  let active = null;
  let keepFocusOnTabs = false;

  // ---- header -----------------------------------------------------------------------
  const title = isBridge ? `Bridge: passages ${p + 1} → ${p + 2}` : `Passage ${p + 1} of ${text.passages.length}`;
  const hasPrev = !isBridge && p > 0;
  const hasNext = !isBridge && p + 1 < text.passages.length;
  // Neighbouring passages open in the current mode (Check becomes Watch).
  const neighbour = (/** @type {number} */ q) => link(['practice', text.id, q], { mode: mode === 'check' ? 'watch' : mode });
  const prevLink = hasPrev ? h('a', { class: 'btn btn-quiet btn-round', href: neighbour(p - 1), 'aria-label': 'Previous passage', title: 'Previous passage' }, h('span', { 'aria-hidden': 'true' }, '‹')) : null;
  const nextLink = hasNext ? h('a', { class: 'btn btn-quiet btn-round', href: neighbour(p + 1), 'aria-label': 'Next passage', title: 'Next passage' }, h('span', { 'aria-hidden': 'true' }, '›')) : null;
  const preview = textSpan(text, unitsText(text, span.start, span.end), 'passage-preview', 'p');
  const ladderHost = h('span', { class: 'ladder-host' });

  const head = h(
    'header',
    { class: 'page-head practice-head' },
    h('p', { class: 'crumbs' }, h('a', { href: '#/' }, 'Texts'), ' › ', h('a', { href: link(['text', text.id]), lang: text.lang, dir: 'auto' }, text.title)),
    h(
      'div',
      { class: 'practice-title' },
      h('h1', null, title),
      ladderHost,
      h('nav', { class: 'passage-nav', 'aria-label': 'Other passages' }, prevLink, nextLink),
    ),
    preview,
  );

  // ---- level picker -----------------------------------------------------------------
  const levelBar = radioKeys(h('div', { class: 'level-bar', role: 'radiogroup', 'aria-label': 'Recitation level' }));
  function renderLevels() {
    const rec = recNow();
    const cleared = highestCleared(rec);
    const suggested = isBridge ? null : recommendedLevel(rec);
    ladderHost.replaceChildren(isBridge ? '' : ladder(rec, { size: 'md' }));
    levelBar.replaceChildren(
      ...LEVELS.map((l) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            class: `level-chip${l.rank <= cleared ? ' is-cleared' : ''}${l.id === suggested ? ' is-suggested' : ''}`,
            'aria-checked': String(l.id === level),
            title: `${l.plain}: ${l.scheme}`,
            onclick: () => setLevel(l.id),
          },
          h('span', { class: 'level-name' }, l.name),
          h('span', { class: 'level-deva', lang: 'sa' }, l.deva),
          l.rank <= cleared ? h('span', { class: 'level-mark' }, icon('check'), h('span', { class: 'sr-only' }, ' (cleared)')) : null,
          l.id === suggested && l.rank > cleared ? h('span', { class: 'sr-only' }, ' (suggested next)') : null,
        ),
      ),
    );
  }
  const levelInfo = h('p', { class: 'level-info' });
  function renderLevelInfo() {
    const l = levelById(level);
    levelInfo.replaceChildren(h('strong', null, `${l.plain}. `), l.blurb, ' ', h('span', { class: 'scheme' }, l.scheme));
  }

  // ---- mode tabs ------------------------------------------------------------------------
  const modes = /** @type {[Mode, string][]} */ ([
    ['watch', 'Watch'],
    ['recall', 'Recall'],
    ['check', 'Check'],
  ]);
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Mode' });
  const panel = h('section', { class: 'mode-panel', role: 'tabpanel', id: 'mode-panel', tabindex: '-1' });
  function renderTabs() {
    tabs.replaceChildren(
      ...modes.map(([m, label], i) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            id: `tab-${m}`,
            class: 'tab',
            'aria-selected': String(m === mode),
            'aria-controls': 'mode-panel',
            tabindex: m === mode ? '0' : '-1',
            onclick: () => setMode(m),
            onkeydown: (/** @type {KeyboardEvent} */ e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const next = modes[(i + (e.key === 'ArrowRight' ? 1 : modes.length - 1)) % modes.length][0];
              // Arrow keys move between tabs; focus stays on the tabs.
              keepFocusOnTabs = true;
              setMode(next);
              keepFocusOnTabs = false;
              /** @type {HTMLElement|null} */ (tabs.querySelector(`#tab-${next}`))?.focus();
            },
          },
          label,
        ),
      ),
    );
    panel.setAttribute('aria-labelledby', `tab-${mode}`);
  }

  function syncUrl() {
    history.replaceState(null, '', link(['practice', text.id, target], { level, mode }));
    prevLink?.setAttribute('href', neighbour(p - 1));
    nextLink?.setAttribute('href', neighbour(p + 1));
  }

  /**
   * Change level and/or mode, then render once.
   * @param {{ level?: LevelId, mode?: Mode }} next
   */
  function show(next) {
    const newLevel = next.level ?? level;
    const newMode = next.mode ?? mode;
    if (newLevel === level && newMode === mode) return;
    const levelChanged = newLevel !== level;
    level = newLevel;
    mode = newMode;
    syncUrl();
    if (levelChanged) {
      renderLevels();
      renderLevelInfo();
    }
    renderTabs();
    renderPanel();
  }
  const setLevel = (/** @type {LevelId} */ l) => show({ level: l });
  const setMode = (/** @type {Mode} */ m) => show({ mode: m });

  // ---- panels -------------------------------------------------------------------------
  function renderPanel() {
    active?.destroy();
    active = null;
    panel.replaceChildren();
    preview.hidden = mode === 'recall';
    const steps = buildPattern(level, items);
    const tokens = tokenize(steps);
    if (mode === 'watch') {
      active = createWatch(panel, {
        text,
        items,
        level,
        steps,
        tokens,
        onDone: () => {
          if (!panel.querySelector('.watch-next')) {
            panel.append(
              h(
                'p',
                { class: 'watch-next' },
                h('button', { type: 'button', class: 'btn btn-primary', onclick: () => setMode('recall') }, 'Now recall it', icon('arrow')),
              ),
            );
          }
        },
      });
    } else if (mode === 'recall') {
      const settings = store.getSettings();
      /** @type {('letters'|'tap'|'speak')[]} */
      const methods = ['letters', 'tap'];
      if (settings.speechInput && canListen()) methods.push('speak');
      const session = createSession({ text, kind: isBridge ? 'bridge' : 'passage', span, level });
      active = createRecall(panel, {
        session,
        method: settings.recallMethod,
        methods,
        cue: cue(),
        autofocus: !keepFocusOnTabs,
        onMethodChange: (m) => store.setSetting('recallMethod', m),
        onFinish: (s) => {
          const { outcome, rec } = commitSession(s);
          lastRounds.set(key(), { results: outcome.results, outcome, rec, level });
          if (outcome.newlyWoven) announce('Passage woven.', 'assertive');
          else if (outcome.newlyCleared) announce(`${levelById(level).name} cleared.`, 'assertive');
          renderLevels();
          setMode('check');
          panel.focus({ preventScroll: true });
        },
      });
    } else {
      active = checkPanel();
    }
  }

  function cue() {
    if (isBridge) return h('span', null, 'Join the end of passage ', String(p + 1), ' to the start of passage ', String(p + 2), '.');
    if (p === 0) return h('span', null, 'From the beginning of ', h('em', { lang: text.lang, dir: 'auto' }, text.title), '.');
    const prev = text.passages[p - 1];
    const from = Math.max(prev.start, prev.end - 3);
    return h('span', null, 'Continue after ', textSpan(text, `…${unitsText(text, from, prev.end).replace(/\n+/g, ' ')}`, 'cue-words'));
  }

  function checkPanel() {
    const last = lastRounds.get(key());
    let view = last ? 'round' : 'all';
    const wrap = h('div', { class: 'check' });
    panel.append(wrap);
    /** @type {{ destroy: () => void }|null} */
    let braid = null;

    function draw() {
      braid?.destroy();
      wrap.replaceChildren();
      if (last) wrap.append(outcomeView(last));
      else
        wrap.append(
          h('p', { class: 'note' }, 'Finish a Recall round to see how it went. Below is this passage’s braid so far, from all your practice.'),
        );
      if (last) {
        wrap.append(
          radioKeys(h(
            'div',
            { class: 'segmented', role: 'radiogroup', 'aria-label': 'Show' },
            ...[['round', 'This round'], ['all', 'All practice']].map(([v, label]) =>
              h('button', { type: 'button', role: 'radio', class: 'segmented-option', 'aria-checked': String(view === v), onclick: () => { view = v; draw(); } }, label),
            ),
          )),
        );
      }
      const st = view === 'round' && last ? statuses(items, { round: last.results }) : statuses(items, { memory: progress });
      const host = h('div');
      wrap.append(host);
      braid = createCheckBraid(host, { text, items, links: st.links, words: st.words, caption: view === 'round' ? 'This round' : 'All practice' });
      wrap.append(legend(), linkList(text, items, st.links), nextActions(last));
    }
    draw();
    return { destroy: () => braid?.destroy() };
  }

  /** @param {NonNullable<ReturnType<typeof lastRounds.get>>} last */
  function outcomeView(last) {
    const { summary, newlyCleared, cleared, newlyWoven, woven } = last.outcome;
    const pct = Math.round(summary.accuracy * 100);
    const headline = summary.perfect ? 'Every word in place.' : pct >= 90 ? 'Well woven.' : pct >= 70 ? 'A few loose threads.' : 'Keep weaving.';
    const lines = [];
    if (isBridge) {
      lines.push(h('li', null, 'The join between the two passages was practised; its links are updated below.'));
      return h(
        'div',
        { class: 'outcome' },
        h('p', { class: 'outcome-headline' }, headline),
        h('p', { class: 'outcome-stats' }, `${summary.got} of ${summary.total} right first time`, summary.unsure ? ` · ${summary.unsure} unsure` : '', summary.missed ? ` · ${summary.missed} missed` : '', summary.answered ? ` · ${pct}%` : ''),
        h('ul', { class: 'outcome-list' }, lines),
      );
    }
    if (newlyWoven) lines.push(h('li', { class: 'win' }, 'This passage is now woven: ghana without an error on two different days.'));
    else if (woven) lines.push(h('li', null, 'This passage is woven.'));
    if (newlyCleared) lines.push(h('li', { class: 'win' }, 'You cleared ', levelLabel(last.level), '.'));
    else if (cleared) lines.push(h('li', null, 'Cleared again at ', levelLabel(last.level), '.'));
    else if (summary.complete) lines.push(h('li', null, 'To clear this level: finish a round with no missed words and at least 90% right.'));
    if (!summary.complete) lines.push(h('li', null, 'You finished early, so this round updated your links but not your level or schedule.'));
    if (last.rec?.sr && summary.complete) lines.push(h('li', null, `Next review: ${relativeDay(last.rec.sr.due, dayNumber())}.`));
    if (last.level === 'ghana' && summary.complete && !summary.perfect && !isWoven(last.rec)) {
      lines.push(h('li', null, 'A passage is woven when you recite ghana with no errors on two different days.'));
    }
    return h(
      'div',
      { class: 'outcome' },
      h('p', { class: 'outcome-headline' }, headline),
      h(
        'p',
        { class: 'outcome-stats' },
        `${summary.got} of ${summary.total} right first time`,
        summary.unsure ? ` · ${summary.unsure} unsure` : '',
        summary.missed ? ` · ${summary.missed} missed` : '',
        summary.answered ? ` · ${pct}%` : '',
      ),
      lines.length ? h('ul', { class: 'outcome-list' }, lines) : null,
    );
  }

  /** @param {ReturnType<typeof lastRounds.get>} last */
  function nextActions(last) {
    const rec = recNow();
    const weakHere = weakLinksIn(progress, span.start, span.end).length;
    const nextLevel = LEVELS.find((l) => l.rank === levelById(level).rank + 1);
    const actions = [
      h('button', { type: 'button', class: `btn ${last && !last.outcome.cleared ? 'btn-primary' : 'btn-secondary'}`, onclick: () => setMode('recall') }, icon('restart'), h('span', null, 'Recall again')),
    ];
    if (nextLevel && last?.outcome.cleared) {
      actions.unshift(h('button', { type: 'button', class: 'btn btn-primary', onclick: () => show({ level: nextLevel.id, mode: 'watch' }) }, h('span', null, `Next level: ${nextLevel.name}`), icon('arrow')));
    }
    if (weakHere) actions.push(linkButton(`Drill weak links (${weakHere})`, link(['drill', text.id], { from: span.start, to: span.end }), { kind: 'secondary' }));
    if (hasNext && (rec ? highestCleared(rec) > 0 : false)) actions.push(linkButton('Next passage', link(['practice', text.id, p + 1], { mode: 'watch' }), { kind: 'quiet' }));
    if (!isBridge && p + 1 < text.passages.length && rec?.rounds && getPassage(progress, text.passages[p + 1])?.rounds) {
      actions.push(linkButton(`Bridge to passage ${p + 2}`, link(['practice', text.id, `b${p}`], { level: 'jata', mode: 'recall' }), { kind: 'quiet' }));
    }
    return h('div', { class: 'action-row' }, actions);
  }

  root.append(head, h('div', { class: 'level-wrap' }, levelBar, levelInfo), tabs, panel);
  renderLevels();
  renderLevelInfo();
  renderTabs();
  renderPanel();
  if (isBridge) root.querySelector('.practice-head')?.append(h('p', { class: 'note' }, 'Patterns stay inside a passage, so bridges knit each passage to the next.'));

  return () => {
    active?.destroy();
    active = null;
  };
}

