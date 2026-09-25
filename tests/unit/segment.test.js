import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  segmentText,
  normalizeText,
  joinUnits,
  chooseJoiner,
  suggestUnitMode,
  unitText,
  graphemes,
} from '../../src/core/segment.js';
import { suggestLanguage, directionFor, detectScript, writtenWithoutSpaces, isValidLanguageTag, languageLabel } from '../../src/core/lang.js';

const cores = (units) => units.map((u) => u.core);
const texts = (units) => units.map(unitText);

describe('normalizeText', () => {
  test('NFC, newlines, trailing spaces, blank lines, trimming', () => {
    const decomposed = 'Café';
    assert.equal(normalizeText(`  ${decomposed} \r\nnext\t line  \r\n\r\n\r\n\r\nlast  `), 'Café\nnext  line\n\nlast');
    assert.equal(normalizeText(null), '');
  });
});

describe('segmentation: English', () => {
  test('keeps punctuation for display but not in the core', () => {
    const u = segmentText('Four score and seven years ago, "our fathers" brought forth (on this continent).');
    assert.deepEqual(cores(u), ['Four', 'score', 'and', 'seven', 'years', 'ago', 'our', 'fathers', 'brought', 'forth', 'on', 'this', 'continent']);
    assert.deepEqual(texts(u).slice(5, 8), ['ago,', '"our', 'fathers"']);
    assert.equal(unitText(u[10]), '(on');
    assert.equal(unitText(u[12]), 'continent).');
  });

  test('hyphenated words and contractions are single units', () => {
    const u = segmentText('A well-known e-mail: I’ve heard it o\'er the battle-field.');
    assert.deepEqual(cores(u), ['A', 'well-known', 'e-mail', 'I’ve', 'heard', 'it', "o'er", 'the', 'battle-field']);
  });

  test('dashes separate words; spaced dashes attach to the previous word', () => {
    const u = segmentText('we can not dedicate—we can not consecrate - this ground');
    assert.deepEqual(cores(u), ['we', 'can', 'not', 'dedicate', 'we', 'can', 'not', 'consecrate', 'this', 'ground']);
    assert.equal(unitText(u[3]), 'dedicate—');
    assert.equal(unitText(u[7]), 'consecrate -');
  });

  test('numbers and abbreviations', () => {
    const u = segmentText('In 1863, the U.S.A. had 3.5 million.');
    assert.deepEqual(cores(u), ['In', '1863', 'the', 'U.S.A', 'had', '3.5', 'million']);
  });

  test('lines, stanzas and sentences are recorded', () => {
    const u = segmentText('HOPE is the thing with feathers\nThat perches in the soul,\n\nAnd sings. Never stops');
    const at = (w) => u.find((x) => x.core === w);
    assert.equal(at('feathers').line, 0);
    assert.equal(at('That').line, 1);
    assert.equal(at('And').para, 1);
    assert.equal(at('HOPE').para, 0);
    // a sentence runs across a single line break, but not across a stanza
    assert.equal(at('That').sent, at('HOPE').sent);
    assert.notEqual(at('And').sent, at('HOPE').sent);
    assert.notEqual(at('Never').sent, at('And').sent);
    // pause strength after each unit
    assert.equal(at('feathers').brk, 2); // line end
    assert.equal(at('soul').brk, 4); // stanza end
    assert.equal(at('sings').brk, 3); // sentence end
    assert.equal(at('thing').brk, 0);
    assert.equal(at('stops').brk, 4); // end of text
  });

  test('joinUnits reproduces the text layout', () => {
    const src = 'HOPE is the thing with feathers\nThat perches in the soul,\n\nAnd sings — never stops.';
    const u = segmentText(src);
    assert.equal(joinUnits(u, chooseJoiner(u, 'word')), src);
  });

  test('works without Intl.Segmenter (regex fallback)', () => {
    const saved = Intl.Segmenter;
    try {
      // @ts-ignore
      Intl.Segmenter = undefined;
      const u = segmentText('“Hope” is the thing—with feathers. Well-known!');
      assert.deepEqual(cores(u), ['Hope', 'is', 'the', 'thing', 'with', 'feathers', 'Well-known']);
      assert.equal(unitText(u[0]), '“Hope”');
      assert.notEqual(u[5].sent, u[6].sent);
      assert.equal(graphemes('नि').length, 1);
    } finally {
      Intl.Segmenter = saved;
    }
  });

  test('empty and whitespace-only input', () => {
    assert.deepEqual(segmentText(''), []);
    assert.deepEqual(segmentText('  \n\n  '), []);
    assert.deepEqual(cores(segmentText('— ! —')), []);
  });
});

describe('segmentation: Indic scripts', () => {
  test('Hindi (Devanagari): danda stays attached, compounds stay whole', () => {
    const u = segmentText('निज भाषा उन्नति अहै, सब उन्नति को मूल।\nबिन निज भाषा-ज्ञान के, मिटत न हिय को सूल॥', { lang: 'hi' });
    assert.deepEqual(cores(u), [
      'निज', 'भाषा', 'उन्नति', 'अहै', 'सब', 'उन्नति', 'को', 'मूल',
      'बिन', 'निज', 'भाषा-ज्ञान', 'के', 'मिटत', 'न', 'हिय', 'को', 'सूल',
    ]);
    assert.equal(unitText(u[3]), 'अहै,');
    assert.equal(unitText(u[7]), 'मूल।');
    assert.equal(unitText(u[16]), 'सूल॥');
    assert.equal(u[7].brk, 3);
    assert.equal(u[8].sent, 1);
  });

  test('Kannada', () => {
    const u = segmentText('ಕನ್ನಡ ಭಾಷೆ ಬಹಳ ಸುಂದರವಾಗಿದೆ.', { lang: 'kn' });
    assert.deepEqual(cores(u), ['ಕನ್ನಡ', 'ಭಾಷೆ', 'ಬಹಳ', 'ಸುಂದರವಾಗಿದೆ']);
    assert.equal(unitText(u[3]), 'ಸುಂದರವಾಗಿದೆ.');
  });

  test('Tamil', () => {
    const u = segmentText('யாமறிந்த மொழிகளிலே தமிழ்மொழி போல்\nஇனிதாவது எங்கும் காணோம்,', { lang: 'ta' });
    assert.deepEqual(cores(u), ['யாமறிந்த', 'மொழிகளிலே', 'தமிழ்மொழி', 'போல்', 'இனிதாவது', 'எங்கும்', 'காணோம்']);
    assert.equal(u[4].line, 1);
  });
});

describe('segmentation: Arabic (right-to-left)', () => {
  test('words, attached punctuation and direction', () => {
    const src = 'الخيل والليل والبيداء تعرفني،\nوالسيف والرمح والقرطاس والقلم';
    const u = segmentText(src, { lang: 'ar' });
    assert.deepEqual(cores(u), ['الخيل', 'والليل', 'والبيداء', 'تعرفني', 'والسيف', 'والرمح', 'والقرطاس', 'والقلم']);
    assert.equal(unitText(u[3]), 'تعرفني،');
    assert.equal(directionFor('ar'), 'rtl');
    assert.equal(suggestLanguage(src).dir, 'rtl');
  });

  test('diacritics (harakat) stay inside the word', () => {
    const u = segmentText('الخَيْلُ وَاللّيْلُ', { lang: 'ar' });
    assert.deepEqual(cores(u), ['الخَيْلُ', 'وَاللّيْلُ']);
  });
});

describe('segmentation: Japanese and Chinese', () => {
  const haiku = '古池や　蛙飛び込む　水の音';

  test('per character', () => {
    const u = segmentText('古池や蛙飛び込む水の音。', { lang: 'ja', mode: 'char' });
    assert.deepEqual(cores(u), ['古', '池', 'や', '蛙', '飛', 'び', '込', 'む', '水', 'の', '音']);
    assert.equal(unitText(u[10]), '音。');
    assert.equal(chooseJoiner(u, 'char'), '');
  });

  test('per phrase', () => {
    const u = segmentText(haiku, { lang: 'ja', mode: 'phrase' });
    assert.deepEqual(cores(u), ['古池や', '蛙飛び込む', '水の音']);
    const zh = segmentText('学而时习之，不亦说乎？', { lang: 'zh', mode: 'phrase' });
    assert.deepEqual(texts(zh), ['学而时习之，', '不亦说乎？']);
  });

  test('per word (dictionary segmentation) covers the text exactly', () => {
    const u = segmentText('古池や蛙飛び込む水の音', { lang: 'ja', mode: 'word' });
    assert.equal(cores(u).join(''), '古池や蛙飛び込む水の音');
    assert.ok(u.length >= 5 && u.length <= 11);
    assert.equal(chooseJoiner(u, 'word'), '');
  });

  test('unit mode suggestions', () => {
    assert.equal(suggestUnitMode(haiku, 'ja'), 'phrase');
    assert.equal(suggestUnitMode('古池や蛙飛び込む水の音', 'ja'), 'char');
    assert.equal(suggestUnitMode('Four score and seven', 'en'), 'word');
  });
});

describe('language detection', () => {
  test('dominant script suggests a language', () => {
    assert.equal(suggestLanguage('Four score and seven years ago').lang, 'en');
    assert.equal(suggestLanguage('निज भाषा उन्नति अहै').lang, 'hi');
    assert.equal(suggestLanguage('ಕನ್ನಡ ಭಾಷೆ').lang, 'kn');
    assert.equal(suggestLanguage('யாமறிந்த மொழிகளிலே').lang, 'ta');
    assert.equal(suggestLanguage('الخيل والليل').lang, 'ar');
    assert.equal(suggestLanguage('学而时习之').lang, 'zh');
    assert.equal(suggestLanguage('古池や蛙飛び込む水の音').lang, 'ja');
    assert.equal(suggestLanguage('한국어').lang, 'ko');
    assert.equal(suggestLanguage('').lang, 'en');
    assert.equal(detectScript('abc אבג אבג').script, 'Hebrew');
  });

  test('direction, spacing and labels', () => {
    assert.equal(directionFor('he'), 'rtl');
    assert.equal(directionFor('fa-IR'), 'rtl');
    assert.equal(directionFor('en'), 'ltr');
    assert.equal(directionFor('x-custom', 'الخيل والليل'), 'rtl');
    assert.equal(writtenWithoutSpaces('ja'), true);
    assert.equal(writtenWithoutSpaces('hi'), false);
    assert.equal(isValidLanguageTag('ta-IN'), true);
    assert.equal(isValidLanguageTag('not a tag'), false);
    assert.match(languageLabel('ta'), /Tamil/);
  });
});
