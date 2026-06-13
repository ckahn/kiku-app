import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TranscriptSegment } from '../types';
import { addFuriganaWithTokenizer, readingToHiragana, getTokenizer } from '../furigana-tokenizer';

function segment(text: string): TranscriptSegment {
  return { text, first_word_index: 0, last_word_index: 0 };
}

async function annotate(text: string) {
  const [result] = await addFuriganaWithTokenizer([segment(text)]);
  return result;
}

describe('readingToHiragana()', () => {
  it('converts katakana readings to hiragana', () => {
    expect(readingToHiragana('タベル')).toBe('たべる');
    expect(readingToHiragana('ニホンゴ')).toBe('にほんご');
  });

  it('passes through non-katakana characters unchanged', () => {
    expect(readingToHiragana('ラーメン')).toBe('らーめん');
    expect(readingToHiragana('あ')).toBe('あ');
  });
});

describe('getTokenizer()', () => {
  it('loads the kuromoji dictionary and returns a working tokenizer', async () => {
    const tokenizer = await getTokenizer();
    expect(tokenizer.tokenize('日本語').length).toBeGreaterThan(0);
  });
});

describe('addFuriganaWithTokenizer() — real tokenizer', () => {
  it('annotates a lexical compound as a single ruby base', async () => {
    const result = await annotate('日本語');
    expect(result.text_furigana).toBe('<ruby>日本語<rt>にほんご</rt></ruby>');
    expect(result.furigana_status).toBe('ok');
    expect(result.furigana_warning).toBeNull();
  });

  it('splits okurigana so only the kanji carries a reading', async () => {
    expect((await annotate('食べる')).text_furigana).toBe('<ruby>食<rt>た</rt></ruby>べる');
    expect((await annotate('聞いて')).text_furigana).toBe('<ruby>聞<rt>き</rt></ruby>いて');
  });

  it('leaves katakana and kana without ruby', async () => {
    const result = await annotate('テスト');
    expect(result.text_furigana).toBe('テスト');
    expect(result.furigana_status).toBe('ok');
  });

  it('corrects a split number+counter compound (rendaku)', async () => {
    const result = await annotate('3匹');
    expect(result.text_furigana).toBe('<ruby>3匹<rt>さんびき</rt></ruby>');
    expect(result.furigana_status).toBe('ok');
  });

  it('corrects a multi-token kanji number+counter compound', async () => {
    // 二十歳 tokenizes as 二 + 十 + 歳; the number run merges into はたち.
    const result = await annotate('二十歳');
    expect(result.text_furigana).toBe('<ruby>二十歳<rt>はたち</rt></ruby>');
    expect(result.furigana_status).toBe('ok');
  });

  it('uses date readings for month and day compounds', async () => {
    // ４月 stays one token; １日 splits into １ + 日 and is corrected to ついたち.
    const result = await annotate('４月１日');
    expect(result.text_furigana).toBe(
      '<ruby>４月<rt>しがつ</rt></ruby><ruby>１日<rt>ついたち</rt></ruby>'
    );
    expect(result.furigana_status).toBe('ok');
  });

  it('reads 何 as なん before the copula です', async () => {
    const result = await annotate('何ですか');
    expect(result.text_furigana).toBe('<ruby>何<rt>なん</rt></ruby>ですか');
    expect(result.furigana_status).toBe('ok');
  });

  it('reads 何 as なん before the particle で', async () => {
    const result = await annotate('何でできますか');
    expect(result.text_furigana).toContain('<ruby>何<rt>なん</rt></ruby>で');
    expect(result.furigana_status).toBe('ok');
  });

  it('reads 日本 as にほん not にっぽん (IPADIC default override)', async () => {
    const result = await annotate('日本の夏');
    expect(result.text_furigana).toContain('<ruby>日本<rt>にほん</rt></ruby>');
    expect(result.furigana_status).toBe('ok');
  });

  it('reads 何 as なに before を (not affected by the なん rule)', async () => {
    const result = await annotate('何をしますか');
    expect(result.text_furigana).toContain('<ruby>何<rt>なに</rt></ruby>を');
  });

  it('flags out-of-vocabulary kanji as suspect instead of guessing', async () => {
    // 彁 is a "ghost character" with no dictionary reading.
    const result = await annotate('彁');
    expect(result.furigana_status).toBe('suspect');
    expect(result.furigana_warning).toMatch(/missing a reading/i);
  });

  it('preserves the original text and indices', async () => {
    const [result] = await addFuriganaWithTokenizer([
      { text: '猫', first_word_index: 4, last_word_index: 6 },
    ]);
    expect(result.text).toBe('猫');
    expect(result.first_word_index).toBe(4);
    expect(result.last_word_index).toBe(6);
  });
});

describe('addFuriganaWithTokenizer() — mock mode', () => {
  beforeEach(() => {
    process.env.USE_MOCKS = 'true';
  });
  afterEach(() => {
    delete process.env.USE_MOCKS;
  });

  it('returns fixture data with ok status', async () => {
    const result = await addFuriganaWithTokenizer([segment('日本語')]);
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(entry.furigana_status).toBe('ok');
      expect(entry.furigana_warning).toBeNull();
      expect(entry).toHaveProperty('text_furigana');
    }
  });
});
