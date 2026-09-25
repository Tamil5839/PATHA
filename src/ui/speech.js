// Speech synthesis (Watch mode voice) and speech recognition (optional
// Recall input), both through the browser's built-in Web Speech API.
// Voice quality and language coverage depend on the device. Recognition is
// off by default: some browsers send the audio to the vendor's servers.

import { primarySubtag } from '../core/lang.js';

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** @returns {SpeechSynthesisVoice[]} */
export function voices() {
  if (!canSpeak()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/** Resolve once the voice list is available (it loads asynchronously). */
export function voicesReady(timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve([]);
    const now = voices();
    if (now.length) return resolve(now);
    const done = () => resolve(voices());
    window.speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

/**
 * Voices for a language, best match first.
 * @param {string} lang
 */
export function voicesFor(lang) {
  const base = primarySubtag(lang);
  const all = voices();
  const exact = all.filter((v) => v.lang.toLowerCase() === lang.toLowerCase());
  const sameBase = all.filter((v) => primarySubtag(v.lang) === base && !exact.includes(v));
  return [...exact, ...sameBase];
}

/**
 * @param {string} lang
 * @param {string} [preferredURI]
 */
export function pickVoice(lang, preferredURI) {
  const list = voicesFor(lang);
  return list.find((v) => v.voiceURI === preferredURI) ?? list.find((v) => v.localService) ?? list[0] ?? null;
}

/**
 * Speak text. Resolves when finished (or cancelled); rejects on error.
 * @param {string} text
 * @param {{ lang: string, rate?: number, voiceURI?: string, onBoundary?: (charIndex: number) => void }} options
 * @returns {{ done: Promise<void>, cancel: () => void }}
 */
export function speak(text, { lang, rate = 1, voiceURI, onBoundary }) {
  if (!canSpeak()) return { done: Promise.reject(new Error('Speech synthesis is not available')), cancel() {} };
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = Math.min(2, Math.max(0.5, rate));
  const voice = pickVoice(lang, voiceURI);
  if (voice) u.voice = voice;
  let cancelled = false;
  const done = new Promise((resolve, reject) => {
    u.onend = () => resolve(undefined);
    u.onerror = (e) => {
      if (cancelled || e.error === 'interrupted' || e.error === 'canceled') resolve(undefined);
      else reject(new Error(e.error || 'speech error'));
    };
    if (onBoundary) u.onboundary = (e) => onBoundary(e.charIndex);
  });
  window.speechSynthesis.speak(u);
  return {
    done: /** @type {Promise<void>} */ (done),
    cancel() {
      cancelled = true;
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    },
  };
}

export function stopSpeaking() {
  if (canSpeak()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

/** @returns {any} */
function Recognition() {
  const w = /** @type {any} */ (window);
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function canListen() {
  return typeof window !== 'undefined' && Boolean(Recognition());
}

/**
 * Listen continuously. Calls onWords with each finalised phrase.
 * @param {{ lang: string, onWords: (text: string) => void, onInterim?: (text: string) => void, onError?: (message: string) => void, onEnd?: () => void }} options
 * @returns {{ stop: () => void }}
 */
export function listen({ lang, onWords, onInterim, onError, onEnd }) {
  const R = Recognition();
  if (!R) {
    onError?.('Speech recognition is not available in this browser.');
    return { stop() {} };
  }
  const rec = new R();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = Boolean(onInterim);
  let stopped = false;
  rec.onresult = (/** @type {any} */ e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) onWords(r[0].transcript);
      else interim += r[0].transcript;
    }
    onInterim?.(interim);
  };
  rec.onerror = (/** @type {any} */ e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    onError?.(
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone access was not allowed.'
        : `Speech recognition stopped (${e.error}).`,
    );
  };
  rec.onend = () => {
    // Browsers end recognition after silence; keep going until stopped.
    if (!stopped) {
      try {
        rec.start();
        return;
      } catch {
        // fall through
      }
    }
    onEnd?.();
  };
  try {
    rec.start();
  } catch (err) {
    onError?.(String(err));
  }
  return {
    stop() {
      stopped = true;
      try {
        rec.stop();
      } catch {
        // ignore
      }
    },
  };
}
