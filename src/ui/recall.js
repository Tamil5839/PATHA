// RECALL: reciting a pattern from memory.
//
// Three ways to answer:
//   letters  type the first letter of each word; the word appears when it
//            is started correctly. First try: got it. One slip: unsure.
//            Two slips, or "Reveal": missed.
//   tap      recite a step (aloud or silently), reveal it, then grade it:
//            Got it / Unsure / Missed. Tapping a word marks just that word.
//   speak    optional speech recognition, only where the browser has it.

import { h, icon, announce } from './dom.js';
import { radioKeys } from './components.js';
import { matchStep, typedGraphemes, sameWord } from '../core/answer.js';
import { unitText, segmentText } from '../core/segment.js';
import { cursor } from './session.js';
import { canListen, listen } from './speech.js';
import { SCORE } from '../core/memory.js';

/** @typedef {import('./session.js').Session} Session */
/** @typedef {'letters'|'tap'|'speak'} Method */

// Scripts typed letter by letter (no input-method composition needed).
const DIRECT_SCRIPTS = /^(en|fr|de|es|it|pt|nl|pl|tr|id|sw|vi|la|ru|uk|el|cs|sk|ro|hu|sv|da|no|nb|fi|et|lv|lt|sl|hr|sr|bs|sq|mt|ga|cy|is|ca|eu|gl|af|ms|tl)$/;

/**
 * @param {HTMLElement} container
 * @param {{
 *   session: Session,
 *   method: Method,
 *   methods: Method[],
 *   cue?: Node|string|null,
 *   layout?: 'steps'|'flow',
 *   onMethodChange?: (m: Method) => void,
 *   onFinish: (session: Session) => void,
 *   autofocus?: boolean,
 * }} options
 */
export function createRecall(container, options) {
  const { session, layout = 'steps' } = options;
  const { text, tokens } = session;
  let method = options.methods.includes(options.method) ? options.method : options.methods[0];
  const n = tokens.length;
  const joiner = text.joiner;
  const core = (/** @type {number} */ k) => text.units[tokens[k].item].core;
  // Continuous recitation shows words as written; reordered patterns show the
  // bare words, since punctuation means nothing out of order.
  const continuous = session.level === 'samhita' || session.kind === 'final';
  const display = (/** @type {number} */ k) => (continuous ? unitText(text.units[tokens[k].item]) : core(k));
  /** @type {HTMLInputElement|null} */
  let letterInput = null;
  /** @type {(() => void)[]} */
  const disposers = [];
  let finished = false;

  const root = h('div', { class: `recall recall-${layout}` });
  container.append(root);

  // ---- method switch ------------------------------------------------------
  const methodLabels = { letters: 'First letters', tap: 'Tap to reveal', speak: 'Speak' };
  const methodBar =
    options.methods.length > 1
      ? radioKeys(h(
          'div',
          { class: 'segmented', role: 'radiogroup', 'aria-label': 'How to answer' },
          options.methods.map((m) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                class: 'segmented-option',
                'aria-checked': String(m === method),
                onclick: () => switchMethod(m),
              },
              methodLabels[m],
            ),
          ),
        ))
      : null;

  // ---- progress -------------------------------------------------------------
  const meter = h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-label': 'Words recited' }, h('div', { class: 'meter-fill' }));
  const counts = h('p', { class: 'recall-counts' });

  // ---- pattern display --------------------------------------------------------
  /** @type {HTMLElement[]} */
  const slots = new Array(n);
  /** @type {HTMLElement[]} */
  const stepEls = [];
  const board = h('div', { class: 'recall-board', lang: text.lang, dir: text.dir, tabindex: '0', role: 'region', 'aria-label': 'The pattern to recite' });
  board.addEventListener('click', () => letterInput?.focus());

  if (layout === 'flow') {
    // The whole text as it is written, lines and paragraphs kept.
    let para = h('p', { class: 'flow-para' });
    board.append(para);
    tokens.forEach((t, k) => {
      const u = text.units[t.item];
      const prev = k > 0 ? text.units[tokens[k - 1].item] : null;
      if (prev && u.para !== prev.para) {
        para = h('p', { class: 'flow-para' });
        board.append(para);
      } else if (prev && u.line !== prev.line) {
        para.append(h('br'));
      } else if (prev && prev.sp) {
        para.append(joiner || ' ');
      }
      slots[k] = slot(k);
      para.append(slots[k]);
    });
  } else {
    const list = h('ol', { class: 'steps' });
    let k = 0;
    session.steps.forEach((step, si) => {
      const li = h('li', { class: 'step', 'data-step': si });
      step.forEach((seg, gi) => {
        if (gi > 0) li.append(h('span', { class: 'seg-gap', 'aria-hidden': 'true' }, ' '));
        const segEl = h('span', { class: 'seg' });
        seg.forEach((_, pi) => {
          if (pi > 0) segEl.append(joiner);
          slots[k] = slot(k);
          segEl.append(slots[k]);
          k++;
        });
        li.append(segEl);
      });
      stepEls.push(li);
      list.append(li);
    });
    board.append(list);
  }

  /** @param {number} k */
  function slot(k) {
    const el = h('span', { class: 'slot is-hidden', 'data-k': k });
    el.append(h('span', { class: 'slot-bead', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, 'hidden word'));
    return el;
  }

  /**
   * @param {number} k
   * @param {number} score
   */
  function reveal(k, score) {
    const el = slots[k];
    el.className = `slot is-revealed ${score >= 1 ? 'is-ok' : score > 0 ? 'is-shaky' : 'is-miss'}`;
    el.replaceChildren(display(k));
    if (score < 1) el.append(h('span', { class: 'sr-only' }, score > 0 ? ' (after a slip)' : ' (missed)'));
  }

  function refresh() {
    const c = cursor(session);
    slots.forEach((el, k) => el.classList.toggle('is-current', k === c && !finished));
    const done = session.scores.filter((x) => x !== null).length;
    /** @type {HTMLElement} */ (meter.firstChild).style.width = `${(100 * done) / Math.max(1, n)}%`;
    meter.setAttribute('aria-valuenow', String(done));
    const missed = session.scores.filter((x) => x === 0).length;
    const shaky = session.scores.filter((x) => x === 0.5).length;
    counts.textContent = `${done} of ${n} words${shaky ? ` · ${shaky} unsure` : ''}${missed ? ` · ${missed} missed` : ''}`;
    if (layout === 'steps' && c < n) {
      const si = tokens[c].step;
      stepEls.forEach((li, i) => {
        li.classList.toggle('is-current', i === si);
        li.classList.toggle('is-done', i < si);
        li.classList.toggle('is-future', i > si);
      });
      scrollIntoViewIfNeeded(stepEls[si]);
    } else if (c < n) {
      scrollIntoViewIfNeeded(slots[c]);
    }
  }

  /** @param {HTMLElement} el */
  function scrollIntoViewIfNeeded(el) {
    const box = board.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * @param {number} k
   * @param {number} score
   */
  function answer(k, score) {
    session.scores[k] = score;
    reveal(k, score);
    if (cursor(session) >= n) finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    for (const d of disposers.splice(0)) d();
    refresh();
    options.onFinish(session);
  }

  // ---- letters ------------------------------------------------------------------
  function lettersPanel() {
    const direct = DIRECT_SCRIPTS.test(text.lang.split('-')[0]);
    const input = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'letter-input',
        type: 'text',
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'none',
        spellcheck: 'false',
        enterkeyhint: 'next',
        lang: text.lang,
        dir: text.dir,
        'aria-label': 'Type the first letter of each word',
        placeholder: 'Type first letters…',
      })
    );
    let composing = false;
    let processed = 0;

    /** @param {string} str */
    function typed(str) {
      let gs = typedGraphemes(str);
      while (gs.length && !finished) {
        const k = cursor(session);
        if (k >= n) break;
        const { result, used } = matchStep(gs, core(k));
        gs = gs.slice(used);
        if (result === 'skip') continue;
        if (result === 'ok') {
          const score = session.wrong[k] === 0 ? SCORE.got : SCORE.unsure;
          announce(display(k));
          answer(k, score);
        } else {
          session.wrong[k] += 1;
          if (session.wrong[k] >= 2) {
            announce(`Missed: ${display(k)}`);
            answer(k, SCORE.missed);
          } else {
            nudge(slots[k]);
            announce('Not that one. Try again.');
          }
        }
      }
      refresh();
    }

    input.addEventListener('compositionstart', () => {
      composing = true;
    });
    input.addEventListener('compositionend', (e) => {
      composing = false;
      if (!direct) typed(e.data || input.value.slice(processed));
      input.value = '';
      processed = 0;
    });
    input.addEventListener('input', (e) => {
      const ev = /** @type {InputEvent} */ (e);
      if ((composing || ev.isComposing) && !direct) return;
      const value = input.value;
      if (value.length < processed) {
        processed = value.length;
        return;
      }
      const fresh = value.slice(processed);
      processed = value.length;
      if (fresh) typed(fresh);
      if (!composing && !ev.isComposing) {
        input.value = '';
        processed = 0;
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });

    const revealBtn = h(
      'button',
      { type: 'button', class: 'btn btn-quiet', onclick: () => revealCurrent() },
      icon('x'),
      h('span', null, 'Reveal word'),
    );
    const panel = h(
      'div',
      { class: 'answer-bar' },
      h('label', { class: 'sr-only', for: 'letter-input' }, 'Type the first letter of each word'),
      input,
      revealBtn,
    );
    input.id = 'letter-input';
    letterInput = input;
    disposers.push(() => {
      letterInput = null;
    });
    if (options.autofocus !== false) setTimeout(() => input.focus({ preventScroll: true }), 0);
    return panel;
  }

  function revealCurrent() {
    const k = cursor(session);
    if (k >= n || finished) return;
    announce(`Revealed: ${display(k)}`);
    answer(k, SCORE.missed);
    refresh();
    // Keep typing without having to click back into the box.
    letterInput?.focus({ preventScroll: true });
  }

  /** @param {HTMLElement} el */
  function nudge(el) {
    el.classList.remove('is-wrong');
    void el.offsetWidth;
    el.classList.add('is-wrong');
  }

  // ---- tap -----------------------------------------------------------------------
  function tapPanel() {
    /** @type {Map<number, 'unsure'|'missed'>} */
    const marks = new Map();
    let revealed = false;
    const prompt = h('p', { class: 'tap-prompt' });
    const actions = h('div', { class: 'tap-actions' });
    /** @type {HTMLElement|null} */
    let revealButton = null;

    function stepRange() {
      const c = cursor(session);
      if (c >= n) return [c, c];
      const si = tokens[c].step;
      let end = c;
      while (end < n && tokens[end].step === si) end++;
      return layout === 'flow' ? [c, Math.min(n, c + 12)] : [c, end];
    }

    function render() {
      const [a, b] = stepRange();
      actions.replaceChildren();
      if (finished || a >= n) return;
      if (!revealed) {
        prompt.textContent = 'Recite the highlighted step, aloud or in your head, then reveal it.';
        revealButton = h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: doReveal }, 'Reveal', h('kbd', null, 'Space'));
        actions.append(revealButton);
        for (let k = a; k < b; k++) slots[k].classList.add('is-pending');
      } else {
        prompt.textContent = 'How did it go? Tap any word you missed to mark just that word.';
        actions.append(
          h('button', { type: 'button', class: 'btn btn-got', onclick: () => grade(SCORE.got) }, 'Got it', h('kbd', null, '1')),
          h('button', { type: 'button', class: 'btn btn-unsure', onclick: () => grade(SCORE.unsure) }, 'Unsure', h('kbd', null, '2')),
          h('button', { type: 'button', class: 'btn btn-missed', onclick: () => grade(SCORE.missed) }, 'Missed', h('kbd', null, '3')),
        );
      }
    }

    function doReveal() {
      const [a, b] = stepRange();
      revealed = true;
      for (let k = a; k < b; k++) {
        const el = slots[k];
        el.className = 'slot is-revealed is-shown';
        el.replaceChildren(display(k));
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-pressed', 'false');
        el.title = 'Tap to mark this word as missed';
        const toggle = () => {
          const cur = marks.get(k);
          const next = cur === undefined ? 'missed' : cur === 'missed' ? 'unsure' : undefined;
          if (next) marks.set(k, next);
          else marks.delete(k);
          el.classList.toggle('is-mark-missed', next === 'missed');
          el.classList.toggle('is-mark-unsure', next === 'unsure');
          el.setAttribute('aria-pressed', String(Boolean(next)));
          el.setAttribute('aria-label', `${display(k)}${next ? `, marked ${next}` : ''}`);
        };
        el.onclick = toggle;
        el.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }
        };
      }
      announce(`Revealed: ${tokens.slice(a, b).map((_, i) => display(a + i)).join(' ')}`);
      render();
      /** @type {HTMLElement|null} */ (actions.querySelector('button'))?.focus();
    }

    /** @param {number} score */
    function grade(score) {
      const [a, b] = stepRange();
      for (let k = a; k < b; k++) {
        const mark = marks.get(k);
        const s = mark === 'missed' ? SCORE.missed : mark === 'unsure' ? SCORE.unsure : score;
        const el = slots[k];
        el.onclick = null;
        el.onkeydown = null;
        el.removeAttribute('role');
        el.removeAttribute('tabindex');
        el.removeAttribute('aria-pressed');
        el.removeAttribute('title');
        session.scores[k] = s;
        reveal(k, s);
      }
      marks.clear();
      revealed = false;
      if (cursor(session) >= n) finish();
      else {
        refresh();
        render();
        /** @type {HTMLElement|null} */ (actions.querySelector('button'))?.focus();
      }
    }

    /** @param {KeyboardEvent} e */
    function onKey(e) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const onOtherButton = e.target instanceof HTMLButtonElement && e.target !== revealButton;
      if (!revealed && (e.key === ' ' || e.key === 'Enter') && !onOtherButton) {
        e.preventDefault();
        doReveal();
      } else if (revealed && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        grade(e.key === '1' ? SCORE.got : e.key === '2' ? SCORE.unsure : SCORE.missed);
      }
    }
    document.addEventListener('keydown', onKey);
    disposers.push(() => document.removeEventListener('keydown', onKey));
    render();
    if (options.autofocus !== false) setTimeout(() => revealButton?.focus({ preventScroll: true }), 0);
    return h('div', { class: 'tap-panel' }, prompt, actions);
  }

  // ---- speak ----------------------------------------------------------------------
  function speakPanel() {
    const status = h('p', { class: 'speak-status', 'aria-live': 'polite' }, 'Press Start and recite the pattern.');
    const heard = h('p', { class: 'speak-heard', lang: text.lang, dir: text.dir });
    /** @type {{ stop: () => void }|null} */
    let listener = null;
    const toggleBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => (listener ? stop() : start()) }, icon('mic'), h('span', null, 'Start listening'));

    function start() {
      listener = listen({
        lang: text.lang,
        onWords: (phrase) => {
          heard.textContent = phrase;
          const words = segmentText(phrase, { lang: text.lang, mode: 'word' }).map((u) => u.core);
          for (const w of words) {
            const k = cursor(session);
            if (k >= n || finished) break;
            if (sameWord(w, core(k))) answer(k, session.wrong[k] ? SCORE.unsure : SCORE.got);
            else if (k + 1 < n && sameWord(w, core(k + 1))) {
              answer(k, SCORE.unsure);
              if (!finished) answer(k + 1, SCORE.got);
            }
          }
          refresh();
        },
        onInterim: (t) => {
          heard.textContent = t;
        },
        onError: (msg) => {
          status.textContent = msg;
          stop();
        },
      });
      status.textContent = 'Listening… recite the highlighted words.';
      /** @type {HTMLElement} */ (toggleBtn.lastChild).textContent = 'Stop listening';
    }
    function stop() {
      listener?.stop();
      listener = null;
      /** @type {HTMLElement} */ (toggleBtn.lastChild).textContent = 'Start listening';
    }
    disposers.push(stop);
    return h(
      'div',
      { class: 'speak-panel' },
      h('p', { class: 'note' }, 'Speech input uses your browser’s recognition. In some browsers (for example Chrome), the audio is sent to the browser maker’s servers to be transcribed.'),
      h('div', { class: 'row' }, toggleBtn, h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => revealCurrent() }, 'Reveal word')),
      status,
      heard,
    );
  }

  // ---- assembly --------------------------------------------------------------------
  const panelHost = h('div', { class: 'recall-panel' });

  function renderPanel() {
    for (const d of disposers.splice(0)) d();
    panelHost.replaceChildren();
    if (finished) return;
    if (method === 'tap') panelHost.append(tapPanel());
    else if (method === 'speak' && canListen()) panelHost.append(speakPanel());
    else panelHost.append(lettersPanel());
  }

  /** @param {Method} m */
  function switchMethod(m) {
    if (m === method) return;
    method = m;
    methodBar?.querySelectorAll('[role=radio]').forEach((b, i) => b.setAttribute('aria-checked', String(options.methods[i] === m)));
    // Clear any half-revealed tap step.
    tokens.forEach((_, k) => {
      if (session.scores[k] === null) {
        slots[k].className = 'slot is-hidden';
        slots[k].onclick = null;
        slots[k].replaceChildren(h('span', { class: 'slot-bead', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, 'hidden word'));
      }
    });
    options.onMethodChange?.(m);
    renderPanel();
    refresh();
    focusPrimary();
  }

  /** Put focus on the control that answers: the letter box or Reveal. */
  function focusPrimary() {
    const target = /** @type {HTMLElement|null} */ (panelHost.querySelector('.letter-input, .tap-actions button, .speak-panel button'));
    target?.focus({ preventScroll: true });
  }

  const restartBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => restart() }, icon('restart'), h('span', null, 'Start over'));
  const finishBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => finish() }, h('span', null, 'Finish now'));

  function restart() {
    session.scores.fill(null);
    session.wrong.fill(0);
    finished = false;
    tokens.forEach((_, k) => {
      slots[k].className = 'slot is-hidden';
      slots[k].onclick = null;
      slots[k].replaceChildren(h('span', { class: 'slot-bead', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, 'hidden word'));
    });
    renderPanel();
    refresh();
    focusPrimary();
  }

  root.append(
    methodBar ?? '',
    options.cue ? h('p', { class: 'cue' }, options.cue) : '',
    h('div', { class: 'recall-status' }, meter, counts),
    board,
    panelHost,
    h('div', { class: 'recall-footer' }, restartBtn, finishBtn),
  );
  renderPanel();
  refresh();

  return {
    destroy() {
      for (const d of disposers.splice(0)) d();
      root.remove();
    },
  };
}
