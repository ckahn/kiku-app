import { describe, it, expect } from 'vitest';
import { counterReading, parseCounterNumber, isKnownCounter } from '../counter-readings';

describe('parseCounterNumber()', () => {
  it('parses arabic and full-width digits', () => {
    expect(parseCounterNumber('3')).toBe(3);
    expect(parseCounterNumber('15')).toBe(15);
    expect(parseCounterNumber('３')).toBe(3);
    expect(parseCounterNumber('２０')).toBe(20);
  });

  it('parses kanji numerals in the 1–100 range', () => {
    expect(parseCounterNumber('一')).toBe(1);
    expect(parseCounterNumber('十')).toBe(10);
    expect(parseCounterNumber('十五')).toBe(15);
    expect(parseCounterNumber('二十')).toBe(20);
    expect(parseCounterNumber('三十一')).toBe(31);
    expect(parseCounterNumber('百')).toBe(100);
  });

  it('maps 何 to the nan sentinel and rejects unparseable input', () => {
    expect(parseCounterNumber('何')).toBe('nan');
    expect(parseCounterNumber('0')).toBeNull();
    expect(parseCounterNumber('abc')).toBeNull();
  });
});

describe('counterReading() — unknown counters and numbers fall back', () => {
  it('returns null for counters not in the table', () => {
    expect(counterReading('3', '冊')).toBeNull();
    expect(isKnownCounter('冊')).toBe(false);
    expect(isKnownCounter('本')).toBe(true);
  });

  it('returns null for out-of-range or unparseable numbers', () => {
    expect(counterReading('200', '本')).toBeNull();
    expect(counterReading('abc', '本')).toBeNull();
  });
});

// Each row: counter → { number string : expected reading }.
// This matrix is the spec; readings are hand-verified standard forms.
const MATRIX: Record<string, Record<string, string>> = {
  本: {
    '1': 'いっぽん', '2': 'にほん', '3': 'さんぼん', '4': 'よんほん', '5': 'ごほん',
    '6': 'ろっぽん', '7': 'ななほん', '8': 'はっぽん', '9': 'きゅうほん', '10': 'じゅっぽん',
    '13': 'じゅうさんぼん', '100': 'ひゃっぽん', '何': 'なんぼん',
  },
  匹: {
    '1': 'いっぴき', '3': 'さんびき', '5': 'ごひき', '6': 'ろっぴき',
    '8': 'はっぴき', '10': 'じゅっぴき', '何': 'なんびき',
  },
  杯: {
    '1': 'いっぱい', '3': 'さんばい', '5': 'ごはい', '6': 'ろっぱい',
    '8': 'はっぱい', '10': 'じゅっぱい', '何': 'なんばい',
  },
  個: {
    '1': 'いっこ', '3': 'さんこ', '5': 'ごこ', '6': 'ろっこ',
    '8': 'はっこ', '10': 'じゅっこ', '何': 'なんこ',
  },
  回: {
    '1': 'いっかい', '3': 'さんかい', '5': 'ごかい', '6': 'ろっかい',
    '8': 'はっかい', '10': 'じゅっかい', '何': 'なんかい',
  },
  階: {
    '1': 'いっかい', '3': 'さんがい', '5': 'ごかい', '6': 'ろっかい',
    '8': 'はっかい', '10': 'じゅっかい', '何': 'なんがい',
  },
  枚: {
    '1': 'いちまい', '3': 'さんまい', '5': 'ごまい', '6': 'ろくまい',
    '8': 'はちまい', '10': 'じゅうまい', '何': 'なんまい',
  },
  歳: {
    '1': 'いっさい', '3': 'さんさい', '5': 'ごさい', '6': 'ろくさい',
    '8': 'はっさい', '10': 'じゅっさい', '20': 'はたち', '何': 'なんさい',
  },
  才: {
    '1': 'いっさい', '20': 'はたち', '何': 'なんさい',
  },
  人: {
    '1': 'ひとり', '2': 'ふたり', '3': 'さんにん', '4': 'よにん', '5': 'ごにん',
    '6': 'ろくにん', '8': 'はちにん', '10': 'じゅうにん', '14': 'じゅうよにん', '何': 'なんにん',
  },
  時: {
    '1': 'いちじ', '3': 'さんじ', '4': 'よじ', '7': 'しちじ', '9': 'くじ',
    '10': 'じゅうじ', '12': 'じゅうにじ', '何': 'なんじ',
  },
  分: {
    '1': 'いっぷん', '2': 'にふん', '3': 'さんぷん', '4': 'よんぷん', '5': 'ごふん',
    '6': 'ろっぷん', '7': 'ななふん', '8': 'はっぷん', '9': 'きゅうふん', '10': 'じゅっぷん',
    '15': 'じゅうごふん', '30': 'さんじゅっぷん', '何': 'なんぷん',
  },
  月: {
    '1': 'いちがつ', '3': 'さんがつ', '4': 'しがつ', '6': 'ろくがつ', '7': 'しちがつ',
    '9': 'くがつ', '10': 'じゅうがつ', '11': 'じゅういちがつ', '12': 'じゅうにがつ', '何': 'なんがつ',
  },
  日: {
    '1': 'ついたち', '2': 'ふつか', '3': 'みっか', '4': 'よっか', '8': 'ようか',
    '10': 'とおか', '11': 'じゅういちにち', '14': 'じゅうよっか', '16': 'じゅうろくにち',
    '20': 'はつか', '21': 'にじゅういちにち', '24': 'にじゅうよっか', '31': 'さんじゅういちにち',
    '何': 'なんにち',
  },
};

describe('counterReading() — reading matrix', () => {
  for (const [counter, cases] of Object.entries(MATRIX)) {
    describe(`counter ${counter}`, () => {
      for (const [number, expected] of Object.entries(cases)) {
        it(`${number}${counter} → ${expected}`, () => {
          expect(counterReading(number, counter)).toBe(expected);
        });
      }
    });
  }
});

describe('counterReading() — kanji numerals compose like arabic', () => {
  it('三匹 reads the same as 3匹', () => {
    expect(counterReading('三', '匹')).toBe('さんびき');
  });
  it('二十歳 reads はたち', () => {
    expect(counterReading('二十', '歳')).toBe('はたち');
  });
});
