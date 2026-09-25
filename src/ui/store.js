// Application state. Everything lives in memory while the app runs and is
// written through to on-device storage. If storage is unavailable or a write
// fails, the app keeps working and says that it is not saving.

import { openStorage } from '../storage/db.js';
import { emptyProgress } from '../core/progress.js';
import { combine } from '../core/backup.js';

/** @typedef {import('../core/textModel.js').Text} Text */
/** @typedef {import('../core/progress.js').Progress} Progress */
/** @typedef {import('../core/backup.js').AppData} AppData */

export const DEFAULT_SETTINGS = Object.freeze({
  /** Words per minute in Watch mode. */
  tempo: 50,
  /** Speak the pattern aloud in Watch mode. */
  voice: false,
  /** Gentle pulse on each word in Watch mode. */
  pulse: true,
  /** Allow speech input in Recall (off by default: audio may go to the browser vendor). */
  speechInput: false,
  /** 'letters' | 'tap' | 'speak' */
  recallMethod: 'letters',
  /** 'system' | 'light' | 'dark' */
  theme: 'system',
  /** 'system' | 'reduce' | 'full' */
  motion: 'system',
  /** 'jata' | 'ghana' */
  drillLevel: 'ghana',
  /** Preferred voice per language: { [lang]: voiceURI } */
  voices: /** @type {Record<string, string>} */ ({}),
});

/** @typedef {typeof DEFAULT_SETTINGS} Settings */

/** @type {import('../storage/db.js').Storage|null} */
let storage = null;
/** @type {Map<string, Text>} */
const texts = new Map();
/** @type {Map<string, Progress>} */
const progress = new Map();
/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS, voices: {} };

export const status = {
  /** Data is being saved on this device. */
  saving: false,
  /** Why saving is off, if it is. */
  reason: '',
};

/** @type {Set<() => void>} */
const listeners = new Set();
let writes = Promise.resolve();

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribe(/** @type {() => void} */ fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * Queue a storage write; failures switch the app to "not saving" mode.
 * @param {(s: import('../storage/db.js').Storage) => Promise<void>} op
 */
function write(op) {
  if (!storage || !status.saving) return Promise.resolve();
  const s = storage;
  writes = writes
    .then(() => op(s))
    .catch((err) => {
      console.warn('Patha: saving failed', err);
      status.saving = false;
      status.reason = 'Saving to this device failed (the browser may be out of space or blocking storage).';
      emit();
    });
  return writes;
}

/**
 * Open storage and load everything.
 * @param {{ indexedDB?: IDBFactory|null }} [options]
 */
export async function init(options = {}) {
  let opened;
  try {
    opened = await openStorage(options);
  } catch (err) {
    opened = null;
    status.reason = String(err);
  }
  storage = opened;
  status.saving = Boolean(opened && opened.persistent);
  if (opened && !opened.persistent) {
    status.reason = 'This browser is not letting Patha store data, so nothing will be saved after you close the page.';
  }
  if (!opened) return;
  try {
    const [t, p, s] = await Promise.all([opened.getAll('texts'), opened.getAll('progress'), opened.getAll('settings')]);
    for (const text of t) texts.set(text.id, text);
    for (const rec of p) progress.set(rec.textId, rec);
    settings = { ...DEFAULT_SETTINGS, voices: {} };
    for (const { key, value } of s) if (key in DEFAULT_SETTINGS) /** @type {any} */ (settings)[key] = value;
  } catch (err) {
    console.warn('Patha: loading failed', err);
    status.saving = false;
    status.reason = 'Saved data could not be read, so Patha is not saving for now.';
  }
  emit();
}

/** Texts, most recently created first. */
export function allTexts() {
  return [...texts.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** @param {string} id */
export function getText(id) {
  return texts.get(id) ?? null;
}

/**
 * Progress for a text (an empty record if none yet).
 * @param {string} textId
 */
export function getProgress(textId) {
  let rec = progress.get(textId);
  if (!rec) {
    rec = emptyProgress(textId);
    progress.set(textId, rec);
  }
  return rec;
}

/** @param {Text} text */
export function saveText(text) {
  texts.set(text.id, text);
  emit();
  return write((s) => s.put('texts', text));
}

/**
 * Save a text whose words changed: its old progress no longer applies.
 * @param {Text} text
 */
export function replaceText(text) {
  texts.set(text.id, text);
  progress.set(text.id, emptyProgress(text.id));
  emit();
  return write(async (s) => {
    await s.put('texts', text);
    await s.put('progress', /** @type {Progress} */ (progress.get(text.id)));
  });
}

/** @param {string} id */
export function deleteText(id) {
  texts.delete(id);
  progress.delete(id);
  emit();
  return write(async (s) => {
    await s.delete('texts', id);
    await s.delete('progress', id);
  });
}

/** @param {Progress} rec */
export function saveProgress(rec) {
  progress.set(rec.textId, rec);
  emit();
  return write((s) => s.put('progress', rec));
}

export function getSettings() {
  return settings;
}

/**
 * @template {keyof Settings} K
 * @param {K} key
 * @param {Settings[K]} value
 */
export function setSetting(key, value) {
  settings = { ...settings, [key]: value };
  emit();
  return write((s) => s.put('settings', { key, value }));
}

/** Everything, for export. @returns {AppData} */
export function snapshot() {
  return {
    texts: [...texts.values()],
    progress: [...progress.values()].filter((p) => texts.has(p.textId)),
    settings: Object.entries(settings).map(([key, value]) => ({ key, value })),
  };
}

/**
 * Apply imported data.
 * @param {AppData} incoming
 * @param {'replace'|'merge'} mode
 */
export async function importData(incoming, mode) {
  const next = combine(snapshot(), incoming, mode);
  texts.clear();
  progress.clear();
  for (const t of next.texts) texts.set(t.id, t);
  for (const p of next.progress) progress.set(p.textId, p);
  settings = { ...DEFAULT_SETTINGS, voices: {} };
  for (const { key, value } of next.settings) if (key in DEFAULT_SETTINGS) /** @type {any} */ (settings)[key] = value;
  emit();
  await write((s) => s.replaceAll(next));
}

/** Delete everything. */
export async function clearAll() {
  texts.clear();
  progress.clear();
  settings = { ...DEFAULT_SETTINGS, voices: {} };
  emit();
  await write((s) => s.replaceAll({ texts: [], progress: [], settings: [] }));
}

/** Wait for pending writes (used before reloads and in tests). */
export function flush() {
  return writes;
}
