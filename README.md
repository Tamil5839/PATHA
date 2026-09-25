# Patha · पाठ

**Memorize anything using the recitation patterns of the Vedic oral tradition.**

Patha is a free, static web app for learning a text by heart: a speech, a
poem, a script, definitions, your own writing. Paste the text and Patha
splits it into short passages. It then guides you through progressively
stronger recitation patterns, from continuous reading up to the *ghana*
weave. That weave recites every word forward and backward with its
neighbours, so a slip stands out at once. Patha tracks which word-to-word
links are weak and drills exactly those.

There is no server, no account and no tracking. Everything stays in your
browser.

> Patha adapts the *structure* of the patterns used in the Vedic tradition,
> which UNESCO recognises as intangible cultural heritage. It does not teach
> Vedic chanting and is no substitute for traditional training. See the
> About page in the app, and [docs/PATTERNS.md](docs/PATTERNS.md) for the
> exact definitions, the conventions chosen, and sources.

## The patterns

For the words `a b c d e` of a passage:

| Level | Recited as |
|---|---|
| Saṃhitā (continuous) | `a b c d e` |
| Pada (word by word) | `a \| b \| c \| d \| e` |
| Krama (overlapping pairs) | `ab \| bc \| cd \| de` |
| Jaṭā (forward, backward, forward) | `ab ba ab \| bc cb bc \| cd dc cd \| de ed de` |
| Ghana (the full weave) | `ab ba abc cba abc \| bc cb bcd dcb bcd \| cd dc cde edc cde \| de ed de` |

Ghana's final pair has no third word, so it is recited in jaṭā form, as
traditional descriptions of ghana state.

## Features

- **Any language.** Words are split with `Intl.Segmenter`. Punctuation is
  kept for display but ignored when checking answers. Right-to-left scripts
  are laid out right to left. Chinese and Japanese can be learned by
  character or by phrase. Noto fonts for Devanagari, Tamil, Kannada, Arabic
  and other scripts are bundled.
- **Passages and bridges.** Long texts are split by sentence (or by line
  for verse), at most 12 words by default. Bridge drills join each passage to
  the next.
- **Watch.** The pattern plays as an animated braid: words are beads, and
  threads loop back and forth as pairs are recited. It has an adjustable
  tempo and an optional gentle pulse, can read aloud with the device's own
  voices, and respects reduced motion.
- **Recall.** Type the first letter of each word; the word appears when you
  start it correctly. Or reveal each step and grade yourself (Got it / Unsure
  / Missed). Speech input is optional and off by default, with a privacy
  note.
- **Check.** Every link is coloured by how the round went: gold (strong),
  amber (shaky) or red (weak). Line styles differ too, and a text list gives
  the same information.
- **Link-based spaced repetition.** Forward and backward links and word
  positions are tracked separately. Each passage is scheduled with SM-2.
  Weak-link drills build mini jaṭā and ghana patterns around the weakest
  links.
- **Progress.** Each passage has a level ladder (Saṃhitā → Ghana). A passage
  is *woven* when you recite ghana with no errors on two different days. A
  final test has you recite the whole text from first letters.
- **Your data.** Stored in IndexedDB. The app still works, without saving,
  if storage is blocked. You can export and import everything as a JSON file.
- **Offline.** After the first visit, a service worker lets the app open
  without a connection.

## Running it

There is no build step. Serve the folder with any static web server:

```sh
npm start            # zero-dependency server at http://localhost:4173/
```

To deploy, publish the repository root to any static host. On GitHub Pages:
**Settings → Pages → Deploy from a branch → `/ (root)`**.

## Tests

```sh
npm install          # dev tools only: Playwright, axe, fake-indexeddb
npm test             # unit tests (Node 20+ with full ICU, the default build)
npm run check        # type-check the JSDoc-annotated sources
npm run test:e2e     # end-to-end tests in Chromium, desktop and phone
PW_ALL_BROWSERS=1 npm run test:e2e   # also Firefox and WebKit, if installed
```

The unit tests check:

- the exact pattern output for 0–5 and 10 words, endings included
- segmentation of English, Hindi, Kannada, Tamil, Arabic, Japanese and
  Chinese
- chunking
- answer checking
- forward and backward link strength updates
- SM-2 scheduling
- storage, including reload and no-storage cases
- export/import round trips

The end-to-end tests drive the real app:

- every practice mode
- data surviving a reload, and working without storage
- backup and restore
- due dates, using a mocked clock
- right-to-left, Indic and IME input
- keyboard use
- an axe accessibility audit of every screen in light and dark themes
- a check that the app makes no requests to other sites, and works offline

See [docs/TESTING.md](docs/TESTING.md) for the manual cross-browser
checklist.

## Project layout

```
index.html            app shell (strict Content-Security-Policy)
styles/app.css        palm-leaf design system, light and dark ("ink") themes
fonts/                bundled Noto subsets + OFL licence (scripts/fetch-fonts.mjs)
src/core/             pure logic, tested in Node
  patterns.js         the five recitation patterns
  segment.js lang.js  Unicode segmentation, script and language detection
  chunk.js            passages and bridges
  answer.js           forgiving answer checking, first-letter matching
  memory.js           link and word strengths
  scheduler.js        SM-2 scheduling
  progress.js         level ladder, woven rule, round recording
  drills.js           weak-link drills
  backup.js           export/import
src/storage/db.js     IndexedDB with an in-memory fallback
src/ui/               views and components (vanilla ES modules)
sw.js                 offline support
tests/unit, tests/e2e
```

## Privacy

- No accounts, analytics or advertising.
- No network requests to anyone. Fonts are bundled, and the content security
  policy blocks connections to other sites.
- Two optional features use the browser's built-in speech services: voices
  for reading aloud, and speech recognition, which is off unless you turn it
  on. In some browsers, such as Chrome, recognition sends audio to the
  browser maker. The app says so where you turn it on.

## Credits

Pattern definitions follow traditional descriptions of the pāṭhas. Sources are
listed in [docs/PATTERNS.md](docs/PATTERNS.md). Fonts: the Noto family, SIL
Open Font License ([fonts/OFL.txt](fonts/OFL.txt)). Sample texts are in the
public domain: Lincoln, Dickinson, Bharatendu Harishchandra, Subramania
Bharati, Bashō and al-Mutanabbi.
