import { describe, it, expect } from 'vitest';
import {
  findUnannotatedKanji,
  renderFuriganaHtml,
  repairFuriganaSpans,
  validateFuriganaSpans,
} from '../furigana';

describe('findUnannotatedKanji()', () => {
  it('returns empty array when all kanji are in ruby tags', () => {
    expect(findUnannotatedKanji('<ruby>聞<rt>き</rt></ruby>いて')).toEqual([]);
    expect(findUnannotatedKanji('<ruby>日本語<rt>にほんご</rt></ruby>')).toEqual([]);
  });

  it('returns bare kanji found outside ruby tags', () => {
    expect(findUnannotatedKanji('ポッドキャストを聞いて')).toEqual(['聞']);
    expect(findUnannotatedKanji('勉<ruby>強<rt>きょう</rt></ruby>')).toEqual(['勉']);
  });

  it('returns empty array for text with no kanji', () => {
    expect(findUnannotatedKanji('こんにちは、ポッドキャスト！')).toEqual([]);
    expect(findUnannotatedKanji('テスト')).toEqual([]);
  });

  it('returns multiple missed kanji', () => {
    expect(findUnannotatedKanji('今日は元気ですか')).toEqual(['今', '日', '元', '気']);
  });
});

describe('repairFuriganaSpans() + renderFuriganaHtml()', () => {
  it('splits an unsplit okurigana span into a kanji-only ruby base', () => {
    const repaired = repairFuriganaSpans([{ surface: '聞いて', reading: 'きいて' }]);
    expect(renderFuriganaHtml(repaired)).toBe('<ruby>聞<rt>き</rt></ruby>いて');
  });

  it('splits a mixed kana-prefix span like ご飯', () => {
    const repaired = repairFuriganaSpans([{ surface: 'ご飯', reading: 'ごはん' }]);
    expect(renderFuriganaHtml(repaired)).toBe('ご<ruby>飯<rt>はん</rt></ruby>');
  });

  it('drops unnecessary readings from kana-only spans', () => {
    const repaired = repairFuriganaSpans([{ surface: 'いた', reading: 'いた' }]);
    expect(renderFuriganaHtml(repaired)).toBe('いた');
  });
});

describe('validateFuriganaSpans()', () => {
  it('returns null for valid kanji-only ruby bases', () => {
    expect(validateFuriganaSpans('日本語', [{ surface: '日本語', reading: 'にほんご' }])).toBeNull();
  });

  it('flags a kanji span missing a reading', () => {
    expect(validateFuriganaSpans('日本', [{ surface: '日本', reading: null }])).toMatch(
      /missing a reading/i
    );
  });

  it('flags spans that do not reconstruct the original segment', () => {
    expect(validateFuriganaSpans('日本語', [{ surface: '日本', reading: 'にほん' }])).toMatch(
      /reconstruct/i
    );
  });

  it('flags mixed Latin+kanji surfaces as not a valid ruby base', () => {
    expect(
      validateFuriganaSpans('abc漢字', [{ surface: 'abc漢字', reading: 'えーびーしーかんじ' }])
    ).toMatch(/must be kanji-only/i);
  });

  it('accepts digit+kanji date/counter compounds', () => {
    expect(validateFuriganaSpans('4月', [{ surface: '4月', reading: 'しがつ' }])).toBeNull();
  });
});
