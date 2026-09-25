# Testing Patha

## Automated

| Suite | Command | Runs in |
|---|---|---|
| Unit | `npm test` | Node 20+ (full ICU, the default Node build) |
| End-to-end | `npm run test:e2e` | Chromium: desktop, and a Pixel 7 phone profile |
| End-to-end, all engines | `PW_ALL_BROWSERS=1 npm run test:e2e` | also Firefox, WebKit desktop and an iPhone profile (install them first with `npx playwright install`) |

What the suites cover is summarised in the [README](../README.md#tests).

The phone profile emulates the viewport, touch and user agent. It does not
reproduce a real phone browser. Automated WebKit is close to Safari, but not
identical. So the checklist below should also be run on real devices before a
release.

## Manual cross-browser checklist

Browsers to cover: Chrome (desktop), Firefox (desktop), Safari (macOS),
Chrome on Android and Safari on iOS. Use a fresh profile or a private window
where noted.

### Everywhere

- [ ] Add each sample. Check that Hindi, Tamil, Arabic and Japanese render in
      the bundled fonts, and that the Arabic beads run right to left.
- [ ] **Watch:** play ghana. Threads animate and loop around beads, the
      tempo slider changes speed, and the pulse can be turned off.
- [ ] **Watch with voice:** turn on "Read aloud". The words are spoken and
      the highlight follows. If the device has no voice for the language,
      the note says so.
- [ ] **Recall, first letters:** a correct letter reveals the word; one slip
      marks it unsure; two slips or Reveal mark it missed.
- [ ] **Recall, tap:** Space reveals, 1/2/3 grade, and tapping a word marks it.
- [ ] **Check:** gold, amber and red threads appear with different line styles;
      "Every link, in words" lists the same information.
- [ ] Reload the page: texts, ladders and schedules are still there.
- [ ] **Settings → Export**, then delete everything, then **Import**:
      everything comes back.
- [ ] System dark mode switches to the ink theme; Settings can force either.
- [ ] Reduced motion (OS setting or Settings → Motion): no pulse, no drawing
      animation; the braid still appears.
- [ ] Keyboard only: skip link, tabs (arrow keys), level chips (arrow keys),
      every button reachable, visible focus.
- [ ] Screen reader (VoiceOver, TalkBack or NVDA): revealed words are
      announced; the braid has a label; results can be read as a list.

### Browser-specific

- [ ] **Safari, private window:** storage may be limited. Either saving works,
      or the "Not saving" banner appears and practice still works.
- [ ] **Firefox:** `Intl.Segmenter` needs Firefox 125 or later. On older
      versions, texts still split into words using the fallback splitter.
- [ ] **Firefox:** there is no speech recognition, so the Speech input
      setting is disabled with an explanation.
- [ ] **Chrome and Edge:** turning on speech input shows the note that audio
      goes to the browser maker; reciting reveals words.
- [ ] **iOS Safari:** Read aloud starts after tapping Play. iOS only allows
      speech after a user gesture.
- [ ] **Android (Gboard) and iOS keyboards:** in first-letter mode, typing
      is not swallowed by autocorrect or prediction; each letter is handled
      once.
- [ ] **Japanese or Chinese input method:** committing a word or phrase
      counts as that word.
- [ ] **Offline:** open the app once, then go offline (airplane mode) and
      reload. The app opens and practice works.
- [ ] **Add to home screen** (Android or iOS): the app opens standalone,
      with the icon.
