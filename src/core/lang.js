// Script and language detection, text direction, and the language list.

/**
 * Scripts Patha recognises, with the language suggested when a text is
 * mostly written in that script. The suggestion is only a starting point:
 * the user can pick any language.
 * @type {{ id: string, re: RegExp, lang: string, rtl?: boolean, noSpaces?: boolean }[]}
 */
const SCRIPTS = [
  { id: 'Latin', re: /\p{Script=Latin}/u, lang: 'en' },
  { id: 'Devanagari', re: /\p{Script=Devanagari}/u, lang: 'hi' },
  { id: 'Bengali', re: /\p{Script=Bengali}/u, lang: 'bn' },
  { id: 'Gurmukhi', re: /\p{Script=Gurmukhi}/u, lang: 'pa' },
  { id: 'Gujarati', re: /\p{Script=Gujarati}/u, lang: 'gu' },
  { id: 'Oriya', re: /\p{Script=Oriya}/u, lang: 'or' },
  { id: 'Tamil', re: /\p{Script=Tamil}/u, lang: 'ta' },
  { id: 'Telugu', re: /\p{Script=Telugu}/u, lang: 'te' },
  { id: 'Kannada', re: /\p{Script=Kannada}/u, lang: 'kn' },
  { id: 'Malayalam', re: /\p{Script=Malayalam}/u, lang: 'ml' },
  { id: 'Sinhala', re: /\p{Script=Sinhala}/u, lang: 'si' },
  { id: 'Arabic', re: /\p{Script=Arabic}/u, lang: 'ar', rtl: true },
  { id: 'Hebrew', re: /\p{Script=Hebrew}/u, lang: 'he', rtl: true },
  { id: 'Syriac', re: /\p{Script=Syriac}/u, lang: 'syr', rtl: true },
  { id: 'Thaana', re: /\p{Script=Thaana}/u, lang: 'dv', rtl: true },
  { id: 'Cyrillic', re: /\p{Script=Cyrillic}/u, lang: 'ru' },
  { id: 'Greek', re: /\p{Script=Greek}/u, lang: 'el' },
  { id: 'Armenian', re: /\p{Script=Armenian}/u, lang: 'hy' },
  { id: 'Georgian', re: /\p{Script=Georgian}/u, lang: 'ka' },
  { id: 'Ethiopic', re: /\p{Script=Ethiopic}/u, lang: 'am' },
  { id: 'Hiragana', re: /\p{Script=Hiragana}/u, lang: 'ja', noSpaces: true },
  { id: 'Katakana', re: /\p{Script=Katakana}/u, lang: 'ja', noSpaces: true },
  { id: 'Han', re: /\p{Script=Han}/u, lang: 'zh', noSpaces: true },
  { id: 'Hangul', re: /\p{Script=Hangul}/u, lang: 'ko' },
  { id: 'Thai', re: /\p{Script=Thai}/u, lang: 'th', noSpaces: true },
  { id: 'Lao', re: /\p{Script=Lao}/u, lang: 'lo', noSpaces: true },
  { id: 'Khmer', re: /\p{Script=Khmer}/u, lang: 'km', noSpaces: true },
  { id: 'Myanmar', re: /\p{Script=Myanmar}/u, lang: 'my', noSpaces: true },
  { id: 'Tibetan', re: /\p{Script=Tibetan}/u, lang: 'bo' },
];

/** Languages offered in the language picker: [BCP 47 tag, label]. */
export const LANGUAGES = [
  ['en', 'English'],
  ['hi', 'Hindi · हिन्दी'],
  ['sa', 'Sanskrit · संस्कृतम्'],
  ['mr', 'Marathi · मराठी'],
  ['ne', 'Nepali · नेपाली'],
  ['bn', 'Bengali · বাংলা'],
  ['pa', 'Punjabi · ਪੰਜਾਬੀ'],
  ['gu', 'Gujarati · ગુજરાતી'],
  ['or', 'Odia · ଓଡ଼ିଆ'],
  ['ta', 'Tamil · தமிழ்'],
  ['te', 'Telugu · తెలుగు'],
  ['kn', 'Kannada · ಕನ್ನಡ'],
  ['ml', 'Malayalam · മലയാളം'],
  ['si', 'Sinhala · සිංහල'],
  ['ur', 'Urdu · اردو'],
  ['ar', 'Arabic · العربية'],
  ['fa', 'Persian · فارسی'],
  ['he', 'Hebrew · עברית'],
  ['zh', 'Chinese · 中文'],
  ['ja', 'Japanese · 日本語'],
  ['ko', 'Korean · 한국어'],
  ['th', 'Thai · ไทย'],
  ['vi', 'Vietnamese · Tiếng Việt'],
  ['id', 'Indonesian · Bahasa Indonesia'],
  ['sw', 'Swahili · Kiswahili'],
  ['tr', 'Turkish · Türkçe'],
  ['ru', 'Russian · Русский'],
  ['uk', 'Ukrainian · Українська'],
  ['el', 'Greek · Ελληνικά'],
  ['es', 'Spanish · Español'],
  ['fr', 'French · Français'],
  ['de', 'German · Deutsch'],
  ['it', 'Italian · Italiano'],
  ['pt', 'Portuguese · Português'],
  ['nl', 'Dutch · Nederlands'],
  ['pl', 'Polish · Polski'],
  ['la', 'Latin · Latina'],
];

const RTL_LANGS = new Set(['ar', 'fa', 'ur', 'he', 'yi', 'ps', 'sd', 'ug', 'dv', 'ckb', 'syr', 'arc']);
const NO_SPACE_LANGS = new Set(['zh', 'ja', 'th', 'lo', 'km', 'my']);

/**
 * The dominant script of a text, by letter count.
 * Kana anywhere in a mostly-Han text marks it as Japanese.
 * @param {string} text
 * @returns {{ script: string|null, counts: Record<string, number> }}
 */
export function detectScript(text) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    const s = SCRIPTS.find((x) => x.re.test(ch));
    const id = s ? s.id : 'Other';
    counts[id] = (counts[id] || 0) + 1;
  }
  let script = null;
  let best = 0;
  for (const [id, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      script = id;
    }
  }
  return { script, counts };
}

/**
 * @param {string} text
 * @returns {{ lang: string, dir: 'ltr'|'rtl', script: string|null, noSpaces: boolean }}
 */
export function suggestLanguage(text) {
  const { script, counts } = detectScript(text);
  const kana = (counts.Hiragana || 0) + (counts.Katakana || 0);
  let info = SCRIPTS.find((s) => s.id === script);
  if ((script === 'Han' || script === 'Hiragana' || script === 'Katakana') && kana > 0) {
    info = SCRIPTS.find((s) => s.id === 'Hiragana');
  }
  const lang = info ? info.lang : 'en';
  return {
    lang,
    script,
    dir: info && info.rtl ? 'rtl' : 'ltr',
    noSpaces: Boolean(info && info.noSpaces),
  };
}

/**
 * Writing direction for a language tag, falling back to the text itself.
 * @param {string} lang
 * @param {string} [text]
 * @returns {'ltr'|'rtl'}
 */
export function directionFor(lang, text = '') {
  if (RTL_LANGS.has(primarySubtag(lang))) return 'rtl';
  // e.g. an Arabic-script text tagged with an uncommon language code
  return text ? suggestLanguage(text).dir : 'ltr';
}

/**
 * Whether a language is normally written without spaces between words.
 * @param {string} lang
 */
export function writtenWithoutSpaces(lang) {
  return NO_SPACE_LANGS.has(primarySubtag(lang));
}

/** @param {string} lang */
export function primarySubtag(lang) {
  return String(lang || '').toLowerCase().split(/[-_]/)[0];
}

/**
 * A human label for a language tag.
 * @param {string} lang
 */
export function languageLabel(lang) {
  const hit = LANGUAGES.find(([tag]) => tag === lang) || LANGUAGES.find(([tag]) => tag === primarySubtag(lang));
  if (hit) return hit[1];
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    return dn.of(lang) || lang;
  } catch {
    return lang;
  }
}

/**
 * Loose validation for a user-entered BCP 47 tag.
 * @param {string} tag
 */
export function isValidLanguageTag(tag) {
  if (!/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(tag)) return false;
  try {
    Intl.getCanonicalLocales(tag);
    return true;
  } catch {
    return false;
  }
}
