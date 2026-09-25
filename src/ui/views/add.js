// Add or edit a text: paste, title, language and unit mode, passage size,
// and a live preview of the passages.

import { h, plural, announce } from '../dom.js';
import * as store from '../store.js';
import { button, confirmDialog, textSpan } from '../components.js';
import { LANGUAGES, suggestLanguage, isValidLanguageTag, directionFor } from '../../core/lang.js';
import { segmentText, suggestUnitMode, joinUnits, chooseJoiner, normalizeText } from '../../core/segment.js';
import { chunkUnits, suggestChunkMode, clampMaxWords, DEFAULT_MAX_WORDS, MAX_WORDS_MIN, MAX_WORDS_MAX } from '../../core/chunk.js';
import { createText, rechunk } from '../../core/textModel.js';
import { sampleById } from '../../core/samples.js';
import { go, link } from '../router.js';

const PREVIEW_LIMIT = 40;

/**
 * @param {HTMLElement} root
 * @param {import('../router.js').Route} route
 */
export function renderAdd(root, route) {
  const editing = route.name === 'edit' ? store.getText(route.parts[0]) : null;
  if (route.name === 'edit' && !editing) throw new Error('not-found');
  const sample = !editing && route.params.sample ? sampleById(route.params.sample) : null;

  // Which fields the user has chosen themselves (auto-suggestions stop there).
  const touched = { lang: Boolean(editing || sample), unit: Boolean(editing || sample), chunk: Boolean(editing || sample) };

  const state = {
    title: editing?.title ?? sample?.title ?? '',
    source: editing?.source ?? sample?.source ?? '',
    raw: editing?.raw ?? sample?.text ?? '',
    lang: editing?.lang ?? sample?.lang ?? 'en',
    unitMode: editing?.unitMode ?? sample?.unitMode ?? 'word',
    chunkMode: editing?.chunk.mode ?? sample?.chunkMode ?? 'sentence',
    maxWords: editing?.chunk.maxWords ?? DEFAULT_MAX_WORDS,
  };

  // ---- fields -------------------------------------------------------------------
  const titleInput = /** @type {HTMLInputElement} */ (
    h('input', { id: 'f-title', type: 'text', value: state.title, maxlength: '120', autocomplete: 'off', dir: 'auto', placeholder: 'e.g. The Gettysburg Address' })
  );
  const textArea = /** @type {HTMLTextAreaElement} */ (
    h('textarea', { id: 'f-text', rows: '10', dir: 'auto', spellcheck: 'false', value: state.raw, placeholder: 'Paste or type the text you want to learn by heart.', 'aria-describedby': 'f-text-help' })
  );
  const sourceInput = /** @type {HTMLInputElement} */ (
    h('input', { id: 'f-source', type: 'text', value: state.source, maxlength: '200', autocomplete: 'off', dir: 'auto', placeholder: 'Author, year (optional)' })
  );

  const known = LANGUAGES.some(([tag]) => tag === state.lang);
  const langSelect = /** @type {HTMLSelectElement} */ (
    h(
      'select',
      { id: 'f-lang', value: known ? state.lang : 'other' },
      LANGUAGES.map(([tag, label]) => h('option', { value: tag }, label)),
      h('option', { value: 'other' }, 'Other language (enter a code)…'),
    )
  );
  const langOther = /** @type {HTMLInputElement} */ (
    h('input', { id: 'f-lang-other', type: 'text', value: known ? '' : state.lang, placeholder: 'e.g. sa-Latn, mai, bo', 'aria-label': 'Language code (BCP 47)', autocomplete: 'off', hidden: known })
  );
  const langHint = h('p', { class: 'hint', id: 'f-lang-hint' });

  const unitRadios = radioGroup('unit', 'Memorise by', [
    ['word', 'Words', 'The usual choice.'],
    ['char', 'Characters', 'For languages written without spaces, such as Chinese or Japanese.'],
    ['phrase', 'Phrases', 'Split at spaces and punctuation: a middle ground for Chinese or Japanese.'],
  ], state.unitMode, (v) => {
    state.unitMode = /** @type {any} */ (v);
    touched.unit = true;
    update();
  });

  const chunkRadios = radioGroup('chunk', 'Split into passages by', [
    ['sentence', 'Sentences', 'One sentence per passage; long ones are split at natural pauses.'],
    ['line', 'Lines', 'For verse: lines are grouped while they fit.'],
    ['fixed', 'Even size', 'Equal-sized passages, ignoring punctuation.'],
  ], state.chunkMode, (v) => {
    state.chunkMode = /** @type {any} */ (v);
    touched.chunk = true;
    update();
  });

  const maxOut = h('output', { for: 'f-max' }, `${state.maxWords} words`);
  const maxInput = /** @type {HTMLInputElement} */ (
    h('input', {
      id: 'f-max',
      type: 'range',
      min: String(MAX_WORDS_MIN),
      max: String(MAX_WORDS_MAX),
      step: '1',
      value: String(state.maxWords),
      oninput: () => {
        state.maxWords = clampMaxWords(maxInput.value);
        maxOut.textContent = `${state.maxWords} words`;
        update();
      },
    })
  );

  const summary = h('p', { class: 'preview-summary', 'aria-live': 'polite' });
  const previewList = h('ol', { class: 'preview-list' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  // ---- behaviour ----------------------------------------------------------------------
  function currentLang() {
    return langSelect.value === 'other' ? langOther.value.trim() || 'und' : langSelect.value;
  }

  let timer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
  function scheduleUpdate() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(update, 180);
  }

  function update() {
    state.raw = textArea.value;
    const raw = normalizeText(state.raw);
    if (!touched.lang && raw) {
      const guess = suggestLanguage(raw);
      if (LANGUAGES.some(([tag]) => tag === guess.lang)) {
        langSelect.value = guess.lang;
        langOther.hidden = true;
      }
    }
    state.lang = currentLang();
    textArea.lang = state.lang;
    textArea.dir = raw ? directionFor(state.lang, raw) : 'auto';
    langHint.textContent = touched.lang ? '' : raw ? 'Detected from the text. Change it if it is wrong.' : '';

    if (!touched.unit && raw) setRadio(unitRadios, (state.unitMode = suggestUnitMode(raw, state.lang)));
    const units = raw ? segmentText(raw, { lang: state.lang, mode: state.unitMode }) : [];
    if (!touched.chunk && units.length) setRadio(chunkRadios, (state.chunkMode = suggestChunkMode(units)));

    const passages = chunkUnits(units, { mode: state.chunkMode, maxWords: state.maxWords });
    const joiner = chooseJoiner(units, state.unitMode);
    summary.textContent = units.length
      ? `${plural(units.length, state.unitMode === 'char' ? 'character' : state.unitMode === 'phrase' ? 'phrase' : 'word')} in ${plural(passages.length, 'passage')}`
      : 'The preview of your passages will appear here.';
    previewList.replaceChildren(
      ...passages.slice(0, PREVIEW_LIMIT).map((p) =>
        h(
          'li',
          null,
          h('span', { class: 'mem', lang: state.lang, dir: directionFor(state.lang, raw) }, joinUnits(units.slice(p.start, p.end), joiner)),
          h('span', { class: 'count' }, String(p.end - p.start)),
        ),
      ),
      passages.length > PREVIEW_LIMIT ? h('li', { class: 'more' }, `…and ${passages.length - PREVIEW_LIMIT} more`) : '',
    );
    return { units, passages };
  }

  textArea.addEventListener('input', scheduleUpdate);
  langSelect.addEventListener('change', () => {
    touched.lang = true;
    langOther.hidden = langSelect.value !== 'other';
    if (!langOther.hidden) langOther.focus();
    update();
  });
  langOther.addEventListener('input', () => {
    touched.lang = true;
    scheduleUpdate();
  });

  async function save(/** @type {SubmitEvent} */ e) {
    e.preventDefault();
    error.hidden = true;
    const { units } = update();
    const lang = currentLang();
    if (!units.length) return fail('Add some text first: there are no words to memorise yet.');
    if (langSelect.value === 'other' && !isValidLanguageTag(lang)) return fail('That language code does not look right. Try a code such as “sa” or “ta-IN”.');
    if (units.length > 20000) return fail('That text is very long. Try adding it in parts of up to 20,000 words.');
    const input = {
      title: titleInput.value,
      source: sourceInput.value,
      raw: textArea.value,
      lang,
      unitMode: /** @type {any} */ (state.unitMode),
      chunk: { mode: /** @type {any} */ (state.chunkMode), maxWords: state.maxWords },
    };
    if (!editing) {
      const text = createText(input);
      await store.saveText(text);
      announce(`Added ${text.title}`);
      go(['text', text.id]);
      return;
    }
    const wordsChanged = normalizeText(input.raw) !== editing.raw || lang !== editing.lang || input.unitMode !== editing.unitMode;
    if (wordsChanged) {
      const ok = await confirmDialog('The words of this text changed, so its progress will start again from the beginning. Continue?', { confirm: 'Save and reset progress', danger: true });
      if (!ok) return;
      const text = createText({ ...input, id: editing.id, now: Date.now() });
      await store.replaceText({ ...text, createdAt: editing.createdAt });
    } else {
      const chunkChanged = input.chunk.mode !== editing.chunk.mode || input.chunk.maxWords !== editing.chunk.maxWords;
      const base = chunkChanged ? rechunk(editing, input.chunk) : editing;
      await store.saveText({ ...base, title: input.title.trim() || editing.title, source: input.source.trim(), updatedAt: Date.now() });
    }
    go(['text', editing.id]);
  }

  /** @param {string} message */
  function fail(message) {
    error.textContent = message;
    error.hidden = false;
    return undefined;
  }

  const form = h(
    'form',
    { class: 'add-form', novalidate: true, onsubmit: save },
    h('div', { class: 'field' }, h('label', { for: 'f-title' }, 'Title'), titleInput),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'f-text' }, 'Text'),
      textArea,
      h('p', { class: 'hint', id: 'f-text-help' }, 'Punctuation is kept for display but ignored when checking your answers. Line breaks and blank lines are kept.'),
    ),
    h('div', { class: 'field-row' },
      h('div', { class: 'field' }, h('label', { for: 'f-lang' }, 'Language'), langSelect, langOther, langHint),
      h('div', { class: 'field' }, h('label', { for: 'f-source' }, 'Source ', h('span', { class: 'muted' }, '(optional)')), sourceInput),
    ),
    unitRadios,
    chunkRadios,
    h('div', { class: 'field field-inline' }, h('label', { for: 'f-max' }, 'At most'), maxInput, maxOut, h('span', { class: 'muted' }, 'per passage')),
    h('section', { class: 'preview', 'aria-labelledby': 'preview-heading' }, h('h2', { id: 'preview-heading' }, 'Passages'), summary, previewList),
    error,
    h(
      'div',
      { class: 'form-actions' },
      h('a', { class: 'btn btn-quiet', href: editing ? link(['text', editing.id]) : '#/' }, 'Cancel'),
      button(editing ? 'Save changes' : 'Save text', { kind: 'primary', type: 'submit' }),
    ),
  );

  root.append(
    h(
      'header',
      { class: 'page-head' },
      h('h1', null, editing ? 'Edit text' : 'Add a text'),
      editing
        ? h('p', { class: 'muted' }, 'Changing only the passage size keeps your progress on every word link.')
        : h('p', { class: 'muted' }, 'It stays on this device. Nothing is uploaded.'),
    ),
    form,
  );
  if (sample) root.querySelector('.page-head')?.append(h('p', { class: 'note' }, 'Sample: ', textSpan(/** @type {any} */ ({ lang: sample.lang, dir: 'auto' }), sample.title), ` · ${sample.source}`));
  update();
  if (!editing && !sample) textArea.focus();
  return () => {
    if (timer) clearTimeout(timer);
  };
}

/**
 * @param {string} name
 * @param {string} legend
 * @param {[string, string, string][]} options  [value, label, help]
 * @param {string} value
 * @param {(v: string) => void} onChange
 */
function radioGroup(name, legend, options, value, onChange) {
  return h(
    'fieldset',
    { class: 'field radio-group' },
    h('legend', null, legend),
    h(
      'div',
      { class: 'radio-options' },
      options.map(([v, label, help]) =>
        h(
          'label',
          { class: 'radio-card' },
          h('input', { type: 'radio', name, value: v, checked: v === value, onchange: () => onChange(v) }),
          h('span', { class: 'radio-label' }, label),
          h('span', { class: 'radio-help' }, help),
        ),
      ),
    ),
  );
}

/**
 * @param {HTMLElement} group
 * @param {string} value
 */
function setRadio(group, value) {
  for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (group.querySelectorAll('input[type=radio]'))) {
    input.checked = input.value === value;
  }
}
