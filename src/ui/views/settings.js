// Settings and data: backup and restore, storage status, voice, speech
// input, appearance, and deleting everything.

import { h, icon, downloadText, announce, plural } from '../dom.js';
import * as store from '../store.js';
import { button, confirmDialog } from '../components.js';
import { backupJson, backupFileName, parseBackup, BackupError } from '../../core/backup.js';
import { canSpeak, canListen, voicesReady, voicesFor } from '../speech.js';
import { languageLabel } from '../../core/lang.js';

/** @param {HTMLElement} root */
export function renderSettings(root) {
  const settings = store.getSettings();
  const texts = store.allTexts();
  const message = h('p', { class: 'form-message', role: 'status' });

  // ---- backup -----------------------------------------------------------------------
  const fileInput = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: 'application/json,.json', id: 'import-file', class: 'sr-only' }));
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const data = parseBackup(await file.text());
      const replace = await confirmDialog(
        `This backup has ${plural(data.texts.length, 'text')}. Replace everything on this device with it? Choose “Merge” to keep your current texts too.`,
        { confirm: 'Replace everything', cancel: 'Merge instead', danger: true },
      );
      await store.importData(data, replace ? 'replace' : 'merge');
      message.textContent = `Imported ${plural(data.texts.length, 'text')}${replace ? '' : ', merged with what was here'}.`;
      announce(message.textContent);
    } catch (err) {
      message.textContent = err instanceof BackupError ? err.message : 'That file could not be imported.';
      announce(message.textContent, 'assertive');
    }
  });

  const backup = h(
    'section',
    { class: 'settings-section', 'aria-labelledby': 'backup-heading' },
    h('h2', { id: 'backup-heading' }, 'Backup'),
    h('p', null, 'Everything lives only on this device. Export a backup to keep it safe or to move it to another device, then import it there.'),
    h(
      'div',
      { class: 'action-row' },
      button('Export all data', {
        kind: 'primary',
        icon: 'download',
        onClick: () => {
          downloadText(backupFileName(), backupJson(store.snapshot()));
          message.textContent = `Exported ${plural(texts.length, 'text')} with all progress.`;
        },
      }),
      h('label', { class: 'btn btn-secondary', for: 'import-file', tabindex: '0', role: 'button', onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }, icon('upload'), h('span', null, 'Import a backup')),
      fileInput,
    ),
    message,
    h(
      'p',
      { class: store.status.saving ? 'muted' : 'note' },
      store.status.saving
        ? 'Saving automatically in this browser’s storage (IndexedDB). Clearing site data in the browser will erase it.'
        : `Not saving: ${store.status.reason}`,
    ),
  );

  // ---- practice -------------------------------------------------------------------------
  const tempo = /** @type {HTMLInputElement} */ (h('input', { type: 'range', id: 's-tempo', min: '20', max: '150', step: '5', value: String(settings.tempo) }));
  const tempoOut = h('output', { for: 's-tempo' }, `${settings.tempo} words/min`);
  tempo.addEventListener('input', () => (tempoOut.textContent = `${tempo.value} words/min`));
  tempo.addEventListener('change', () => store.setSetting('tempo', Number(tempo.value)));

  const voiceBox = checkbox('s-voice', 'Read patterns aloud in Watch', settings.voice, (v) => store.setSetting('voice', v), !canSpeak());
  const pulseBox = checkbox('s-pulse', 'Gentle pulse on each word in Watch', settings.pulse, (v) => store.setSetting('pulse', v));

  const voiceList = h('div', { class: 'voice-list' });
  if (canSpeak()) {
    voicesReady().then(() => {
      const langs = [...new Set(texts.map((t) => t.lang))];
      voiceList.replaceChildren(
        ...langs.map((lang) => {
          const options = voicesFor(lang);
          const id = `voice-${lang}`;
          if (!options.length) return h('p', { class: 'muted' }, `${languageLabel(lang)}: no voice on this device.`);
          const select = /** @type {HTMLSelectElement} */ (
            h(
              'select',
              { id, value: settings.voices?.[lang] ?? '' },
              h('option', { value: '' }, 'Automatic'),
              options.map((v) => h('option', { value: v.voiceURI }, `${v.name} (${v.lang})${v.localService ? '' : ' · online'}`)),
            )
          );
          select.addEventListener('change', () => store.setSetting('voices', { ...store.getSettings().voices, [lang]: select.value }));
          return h('div', { class: 'field' }, h('label', { for: id }, `Voice for ${languageLabel(lang)}`), select);
        }),
      );
    });
  }

  const practice = h(
    'section',
    { class: 'settings-section', 'aria-labelledby': 'practice-heading' },
    h('h2', { id: 'practice-heading' }, 'Watch'),
    h('div', { class: 'field field-inline' }, h('label', { for: 's-tempo' }, 'Tempo'), tempo, tempoOut),
    pulseBox,
    voiceBox,
    h('p', { class: 'muted' }, canSpeak() ? 'Voices are built into your device or browser, so their quality and the languages they cover vary. Voices marked “online” may send the text to the browser maker to be spoken.' : 'This browser has no built-in voices.'),
    voiceList,
  );

  // ---- speech input ---------------------------------------------------------------------
  const speech = h(
    'section',
    { class: 'settings-section', 'aria-labelledby': 'speech-heading' },
    h('h2', { id: 'speech-heading' }, 'Speech input'),
    checkbox('s-speech', 'Let me recite aloud in Recall (speech recognition)', settings.speechInput, (v) => store.setSetting('speechInput', v), !canListen()),
    h(
      'p',
      { class: 'note' },
      canListen()
        ? 'Off by default. In some browsers, including Chrome, speech recognition sends your audio to the browser maker’s servers to be transcribed. Patha itself never sends anything anywhere.'
        : 'This browser does not offer speech recognition. Typing first letters or tapping to reveal works everywhere.',
    ),
  );

  // ---- appearance --------------------------------------------------------------------------
  const appearance = h(
    'section',
    { class: 'settings-section', 'aria-labelledby': 'look-heading' },
    h('h2', { id: 'look-heading' }, 'Appearance'),
    select('s-theme', 'Theme', [['system', 'Match this device'], ['light', 'Palm leaf (light)'], ['dark', 'Ink (dark)']], settings.theme, (v) => store.setSetting('theme', /** @type {any} */ (v))),
    select('s-motion', 'Motion', [['system', 'Match this device'], ['reduce', 'Reduce motion'], ['full', 'Full animation']], settings.motion, (v) => store.setSetting('motion', /** @type {any} */ (v))),
  );

  // ---- danger -------------------------------------------------------------------------------
  const danger = h(
    'section',
    { class: 'settings-section danger-zone', 'aria-labelledby': 'danger-heading' },
    h('h2', { id: 'danger-heading' }, 'Delete everything'),
    h('p', null, 'Removes every text, all progress and all settings from this device.'),
    button('Delete all data', {
      kind: 'danger',
      icon: 'trash',
      onClick: async () => {
        const ok = await confirmDialog('Delete all texts, progress and settings from this device? Export a backup first if you might want them back.', { confirm: 'Delete everything', danger: true });
        if (!ok) return;
        await store.clearAll();
        message.textContent = 'Everything was deleted.';
        location.hash = '#/';
      },
    }),
  );

  root.append(h('header', { class: 'page-head' }, h('h1', null, 'Settings and backup')), backup, practice, speech, appearance, danger);
}

/**
 * @param {string} id
 * @param {string} label
 * @param {boolean} checked
 * @param {(v: boolean) => void} onChange
 * @param {boolean} [disabled]
 */
function checkbox(id, label, checked, onChange, disabled = false) {
  const input = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', id, checked, disabled }));
  input.addEventListener('change', () => onChange(input.checked));
  return h('div', { class: 'field field-check' }, input, h('label', { for: id }, label));
}

/**
 * @param {string} id
 * @param {string} label
 * @param {[string, string][]} options
 * @param {string} value
 * @param {(v: string) => void} onChange
 */
function select(id, label, options, value, onChange) {
  const el = /** @type {HTMLSelectElement} */ (h('select', { id, value }, options.map(([v, l]) => h('option', { value: v }, l))));
  el.addEventListener('change', () => onChange(el.value));
  return h('div', { class: 'field' }, h('label', { for: id }, label), el);
}
