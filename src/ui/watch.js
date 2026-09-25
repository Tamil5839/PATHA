// WATCH: the pattern plays as an animation. Words are beads; each pair is
// joined by a thread as it is recited, so jaṭā and ghana visibly weave back
// and forth. Optional gentle pulse and optional voice (the browser's own
// speech synthesis).

import { h, icon, reducedMotion } from './dom.js';
import { createBraid, drawTransition } from './braid.js';
import { unitText } from '../core/segment.js';
import { canSpeak, speak, stopSpeaking, voicesFor, voicesReady } from './speech.js';
import * as store from './store.js';

/** @typedef {import('../core/textModel.js').Text} Text */
/** @typedef {import('../core/patterns.js').Token} Token */
/** @typedef {import('../core/patterns.js').LevelId} LevelId */

/**
 * @param {HTMLElement} container
 * @param {{
 *   text: Text,
 *   items: number[],
 *   level: LevelId,
 *   steps: number[][][],
 *   tokens: Token[],
 *   onDone?: () => void,
 *   autoplay?: boolean,
 * }} options
 */
export function createWatch(container, options) {
  const { text, items, level, steps, tokens } = options;
  const n = tokens.length;
  const continuous = level === 'samhita';
  const label = (/** @type {number} */ item) => (continuous ? unitText(text.units[item]) : text.units[item].core);

  const root = h('div', { class: 'watch' });
  container.append(root);

  const braidHost = h('div', { class: 'braid-host' });
  const recitation = h('p', { class: 'recitation', lang: text.lang, dir: text.dir, 'aria-live': 'off' });
  const stepCounter = h('p', { class: 'step-counter' });

  const braid = createBraid(braidHost, {
    units: text.units,
    items,
    dir: text.dir,
    lang: text.lang,
    density: level,
    label: `The ${level} pattern as a braid: each word is a bead, each recited pair a thread.`,
  });

  let k = 0; // next token to play
  let playing = false;
  let generation = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  /** @type {ReturnType<typeof setInterval>|null} */
  let ticker = null;
  /** @type {ReturnType<typeof speak>|null} */
  let utterance = null;
  let shownStep = -1;
  let voiceFailed = false;

  const settings = () => store.getSettings();
  const beat = () => 60000 / Math.max(10, settings().tempo);

  // ---- recitation line ----------------------------------------------------------
  /** @type {HTMLElement[]} */
  let wordEls = [];
  /** @param {number} si */
  function showStep(si) {
    shownStep = si;
    recitation.replaceChildren();
    wordEls = [];
    const step = steps[si] || [];
    step.forEach((seg, gi) => {
      if (gi > 0) recitation.append(h('span', { class: 'seg-sep', 'aria-hidden': 'true' }, ' · '));
      const segEl = h('span', { class: 'seg' });
      seg.forEach((item, pi) => {
        if (pi > 0) segEl.append(text.joiner);
        const w = h('span', { class: 'w' }, label(item));
        wordEls.push(w);
        segEl.append(w);
      });
      recitation.append(segEl);
    });
    stepCounter.textContent = steps.length > 1 ? `Step ${si + 1} of ${steps.length}` : '';
  }

  /** Index of token kk within its step. */
  const posInStep = (/** @type {number} */ kk) => {
    let i = kk;
    while (i > 0 && tokens[i - 1].step === tokens[kk].step) i--;
    return kk - i;
  };

  /**
   * @param {number} kk
   * @param {boolean} animate
   */
  function playToken(kk, animate) {
    const t = tokens[kk];
    if (t.step !== shownStep) {
      braid.settle();
      showStep(t.step);
    } else if (t.pos === 0) {
      braid.settle();
    }
    drawTransition(braid, tokens, kk, animate ? Math.min(beat() * 0.85, 900) : 0);
    wordEls.forEach((el, i) => el.classList.toggle('is-current', i === posInStep(kk)));
    braid.setCurrent(t.item);
    if (animate && settings().pulse && !reducedMotion()) braid.pulse(t.item);
  }

  // ---- playback -------------------------------------------------------------------
  function clearTimers() {
    if (timer) clearTimeout(timer);
    if (ticker) clearInterval(ticker);
    timer = null;
    ticker = null;
  }

  function stopPlayback() {
    generation++;
    clearTimers();
    if (utterance) {
      utterance.cancel();
      utterance = null;
    }
    stopSpeaking();
  }

  function next() {
    if (!playing) return;
    if (k >= n) {
      finish();
      return;
    }
    if (settings().voice && canSpeak() && !voiceFailed) playSegmentAloud();
    else playTimed();
  }

  function playTimed() {
    const my = generation;
    playToken(k, true);
    const t = tokens[k];
    const after = tokens[k + 1];
    k++;
    let delay = beat();
    if (after && after.step !== t.step) delay += beat();
    else if (after && after.seg !== t.seg) delay += beat() * 0.4;
    timer = setTimeout(() => {
      if (my === generation) next();
    }, delay);
  }

  function playSegmentAloud() {
    const my = generation;
    const start = k;
    let end = k;
    while (end < n && tokens[end].step === tokens[start].step && tokens[end].seg === tokens[start].seg) end++;
    const words = [];
    const offsets = [];
    let pos = 0;
    const sep = text.joiner || '';
    for (let i = start; i < end; i++) {
      const w = text.units[tokens[i].item].core;
      offsets.push(pos);
      words.push(w);
      pos += w.length + sep.length;
    }
    let shown = start;
    playToken(start, true);
    const advanceTo = (/** @type {number} */ target) => {
      while (shown < Math.min(target, end - 1)) {
        shown++;
        playToken(shown, true);
      }
    };
    // Some voices report word boundaries; otherwise pace by the tempo.
    ticker = setInterval(() => {
      if (my === generation) advanceTo(shown + 1);
    }, beat());
    utterance = speak(words.join(sep), {
      lang: text.lang,
      rate: Math.min(1.6, Math.max(0.6, settings().tempo / 60)),
      voiceURI: settings().voices?.[text.lang],
      onBoundary: (charIndex) => {
        if (my !== generation) return;
        let w = 0;
        while (w + 1 < offsets.length && offsets[w + 1] <= charIndex) w++;
        advanceTo(start + w);
      },
    });
    utterance.done
      .then(() => {
        if (my !== generation) return;
        if (ticker) clearInterval(ticker);
        ticker = null;
        advanceTo(end - 1);
        k = end;
        const gap = tokens[end] && tokens[end].step !== tokens[start].step ? beat() : beat() * 0.35;
        timer = setTimeout(() => {
          if (my === generation) next();
        }, gap);
      })
      .catch(() => {
        if (my !== generation) return;
        if (ticker) clearInterval(ticker);
        ticker = null;
        voiceFailed = true;
        voiceNote.textContent = 'The voice stopped working, so Patha continues silently.';
        k = shown + 1;
        next();
      });
  }

  function play() {
    if (k >= n) restart(false);
    playing = true;
    updateControls();
    next();
  }

  function pause() {
    playing = false;
    stopPlayback();
    updateControls();
  }

  function finish() {
    playing = false;
    stopPlayback();
    braid.settle();
    braid.setCurrent(null);
    wordEls.forEach((el) => el.classList.remove('is-current'));
    updateControls();
    doneNote.hidden = false;
    options.onDone?.();
  }

  /**
   * Jump to the start of a step, with the braid drawn up to that point.
   * @param {number} si
   */
  function seekStep(si) {
    const wasPlaying = playing;
    playing = false;
    stopPlayback();
    const target = Math.max(0, Math.min(steps.length - 1, si));
    braid.reset();
    const first = tokens.findIndex((t) => t.step === target);
    for (let i = 1; i < first; i++) drawTransition(braid, tokens, i, 0);
    braid.settle();
    k = Math.max(0, first);
    showStep(target);
    braid.setCurrent(null);
    doneNote.hidden = true;
    if (wasPlaying) play();
    else updateControls();
  }

  /** @param {boolean} [autoplay] */
  function restart(autoplay = false) {
    seekStep(0);
    if (autoplay) play();
  }

  // ---- controls ---------------------------------------------------------------------
  const playBtn = h('button', { type: 'button', class: 'btn btn-primary btn-round btn-lg', onclick: () => (playing ? pause() : play()) });
  // Previous: back to the start of the current step, or to the step before
  // if already there. Next: the following step.
  function prevStep() {
    const first = tokens.findIndex((t) => t.step === shownStep);
    const atStart = k <= first + (playing ? 1 : 0);
    seekStep(atStart ? shownStep - 1 : shownStep);
  }
  function nextStep() {
    if (shownStep + 1 < steps.length) seekStep(shownStep + 1);
  }
  const prevBtn = h('button', { type: 'button', class: 'btn btn-quiet btn-round', 'aria-label': 'Previous step', title: 'Previous step', onclick: prevStep }, icon('prev'));
  const nextBtn = h('button', { type: 'button', class: 'btn btn-quiet btn-round', 'aria-label': 'Next step', title: 'Next step', onclick: nextStep }, icon('next'));
  const restartBtn = h('button', { type: 'button', class: 'btn btn-quiet btn-round', 'aria-label': 'Restart', title: 'Restart', onclick: () => restart(playing) }, icon('restart'));

  function updateControls() {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'), h('span', { class: 'sr-only' }, playing ? 'Pause' : k >= n ? 'Play again' : 'Play'));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : k >= n ? 'Play again' : 'Play');
  }

  const tempoOut = h('output', { for: 'tempo' });
  const tempo = /** @type {HTMLInputElement} */ (
    h('input', {
      id: 'tempo',
      type: 'range',
      min: '20',
      max: '150',
      step: '5',
      value: String(settings().tempo),
      oninput: () => {
        tempoOut.textContent = `${tempo.value} words/min`;
      },
      onchange: () => store.setSetting('tempo', Number(tempo.value)),
    })
  );
  tempoOut.textContent = `${settings().tempo} words/min`;

  const voiceNote = h('p', { class: 'note' });
  const voiceBox = /** @type {HTMLInputElement} */ (
    h('input', {
      type: 'checkbox',
      id: 'voice',
      checked: settings().voice,
      disabled: !canSpeak(),
      onchange: () => {
        voiceFailed = false;
        store.setSetting('voice', voiceBox.checked);
        describeVoice();
        if (!voiceBox.checked) stopSpeaking();
      },
    })
  );
  function describeVoice() {
    if (!canSpeak()) {
      voiceNote.textContent = 'This browser has no built-in voice.';
      return;
    }
    voicesReady().then(() => {
      const count = voicesFor(text.lang).length;
      voiceNote.textContent = count
        ? 'Uses a voice built into your device; quality depends on the device.'
        : 'Your device has no voice for this language, so a voice for another language may be used, or none.';
    });
  }
  describeVoice();

  const pulseBox = /** @type {HTMLInputElement} */ (
    h('input', { type: 'checkbox', id: 'pulse', checked: settings().pulse, onchange: () => store.setSetting('pulse', pulseBox.checked) })
  );

  const doneNote = h('p', { class: 'done-note', hidden: true }, 'The weave is complete.');

  const wholePattern = h(
    'details',
    { class: 'whole-pattern' },
    h('summary', null, 'Show the whole pattern as text'),
    h(
      'ol',
      { class: 'pattern-list', lang: text.lang, dir: text.dir },
      steps.map((step) => h('li', null, step.map((seg) => seg.map((item) => label(item)).join(text.joiner)).join('  ·  '))),
    ),
  );

  root.append(
    braidHost,
    h('div', { class: 'recitation-wrap' }, stepCounter, recitation, doneNote),
    h('div', { class: 'transport', role: 'group', 'aria-label': 'Playback' }, restartBtn, prevBtn, playBtn, nextBtn),
    h(
      'div',
      { class: 'watch-options' },
      h('div', { class: 'field field-inline' }, h('label', { for: 'tempo' }, 'Tempo'), tempo, tempoOut),
      h('div', { class: 'field field-check' }, pulseBox, h('label', { for: 'pulse' }, 'Gentle pulse on each word')),
      h('div', { class: 'field field-check' }, voiceBox, h('label', { for: 'voice' }, icon('speaker'), ' Read aloud')),
      voiceNote,
    ),
    wholePattern,
  );

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('input, textarea, select, [contenteditable], summary, button, a')) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === ' ') {
      e.preventDefault();
      playing ? pause() : play();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextBtn.click();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevBtn.click();
    }
  }
  document.addEventListener('keydown', onKey);

  showStep(0);
  updateControls();
  if (options.autoplay) play();

  return {
    destroy() {
      playing = false;
      stopPlayback();
      document.removeEventListener('keydown', onKey);
      braid.destroy();
      root.remove();
    },
  };
}
