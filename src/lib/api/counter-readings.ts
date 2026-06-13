// Deterministic readings for `number + counter` compounds.
//
// A morphological tokenizer (kuromoji) reads counters in their *base* form and ignores
// rendaku (sequential voicing) and gemination, so it produces wrong-but-plausible readings
// like 三匹 → さんひき (correct: さんびき) and 1日 → にち (correct: ついたち). Those errors are
// NOT caught by structural validation, so we override them here with hand-verified data.
//
// Rendaku is driven entirely by the *number*, so every reading below is deterministic. The
// accompanying test matrix (counter-readings.test.ts) is the source of truth — change data
// and tests together.

interface CounterDef {
  // Plain counter reading, used after non-triggering numbers (2, 4, 5, 7, 9) and tens.
  readonly base: string;
  // Counter form after a geminating number (those in `geminateAt`). Defaults to `base` when
  // only the number geminates (e.g. 個 → いっこ) but the counter itself is unchanged.
  readonly geminate?: string;
  // Counter form after 3 (and 何, via `nan`) when the counter voices, e.g. 本 → さんぼん.
  readonly voiced?: string;
  // Numbers whose reading geminates before this counter (1→いっ, 6→ろっ, 8→はっ, 10→じゅっ,
  // 100→ひゃっ). Differs by counter: k/h-counters include 6, さ-counters (歳) do not.
  readonly geminateAt: ReadonlySet<number>;
  // Full reading for an *exact* number that is wholly irregular (e.g. 1日 ついたち, 20歳 はたち).
  // Checked before any compositional logic.
  readonly exact?: Readonly<Record<number, string>>;
  // Reading of the ones-position `digit + counter` unit when it is irregular but still composes
  // for teens (e.g. 時 4→よじ so 14時 → じゅうよじ; 人 4→よにん so 14人 → じゅうよにん).
  readonly unitOverride?: Readonly<Record<number, string>>;
  // Reading for 何 + counter.
  readonly nan: string;
}

// Sino-Japanese number readings used with counters.
const PLAIN: Readonly<Record<number, string>> = {
  1: 'いち', 2: 'に', 3: 'さん', 4: 'よん', 5: 'ご',
  6: 'ろく', 7: 'なな', 8: 'はち', 9: 'きゅう', 10: 'じゅう', 100: 'ひゃく',
};

// Geminated number forms, used only before a counter that geminates at that number.
const GEMINATED: Readonly<Record<number, string>> = {
  1: 'いっ', 6: 'ろっ', 8: 'はっ', 10: 'じゅっ', 100: 'ひゃっ',
};

const ageDef: CounterDef = {
  base: 'さい',
  geminateAt: new Set([1, 8, 10]), // 6歳 is ろくさい — no gemination
  exact: { 20: 'はたち' },
  nan: 'なんさい',
};

const COUNTERS: Readonly<Record<string, CounterDef>> = {
  // Dates
  月: {
    base: 'がつ',
    geminateAt: new Set(),
    unitOverride: { 4: 'しがつ', 7: 'しちがつ', 9: 'くがつ' },
    nan: 'なんがつ',
  },
  日: {
    base: 'にち',
    geminateAt: new Set(),
    exact: {
      1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか',
      6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか',
      14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか',
    },
    nan: 'なんにち',
  },
  // Time
  時: {
    base: 'じ',
    geminateAt: new Set(),
    unitOverride: { 4: 'よじ', 7: 'しちじ', 9: 'くじ' },
    nan: 'なんじ',
  },
  分: {
    base: 'ふん',
    geminate: 'ぷん',
    geminateAt: new Set([1, 6, 8, 10, 100]),
    unitOverride: { 3: 'さんぷん', 4: 'よんぷん' },
    nan: 'なんぷん',
  },
  // People and age
  人: {
    base: 'にん',
    geminateAt: new Set(),
    exact: { 1: 'ひとり', 2: 'ふたり' },
    unitOverride: { 4: 'よにん' },
    nan: 'なんにん',
  },
  歳: ageDef,
  才: ageDef,
  // Generic objects
  本: {
    base: 'ほん', geminate: 'ぽん', voiced: 'ぼん',
    geminateAt: new Set([1, 6, 8, 10, 100]), nan: 'なんぼん',
  },
  匹: {
    base: 'ひき', geminate: 'ぴき', voiced: 'びき',
    geminateAt: new Set([1, 6, 8, 10, 100]), nan: 'なんびき',
  },
  杯: {
    base: 'はい', geminate: 'ぱい', voiced: 'ばい',
    geminateAt: new Set([1, 6, 8, 10, 100]), nan: 'なんばい',
  },
  個: {
    base: 'こ',
    geminateAt: new Set([1, 6, 8, 10, 100]), nan: 'なんこ',
  },
  回: {
    base: 'かい',
    geminateAt: new Set([1, 6, 8, 10, 100]), nan: 'なんかい',
  },
  階: {
    base: 'かい', voiced: 'がい',
    geminateAt: new Set([1, 6, 8, 10, 100]), nan: 'なんがい',
  },
  枚: {
    base: 'まい',
    geminateAt: new Set(), nan: 'なんまい',
  },
};

const KANJI_DIGITS: Readonly<Record<string, number>> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** Parse a number surface (arabic, full-width, or kanji numerals) into a value, or 'nan' for 何. */
export function parseCounterNumber(surface: string): number | 'nan' | null {
  if (surface === '何') return 'nan';

  const ascii = surface.replace(/[０-９]/g, (d) =>
    String.fromCharCode(d.charCodeAt(0) - 0xff10 + 0x30)
  );
  if (/^[0-9]+$/.test(ascii)) {
    const n = Number(ascii);
    return n >= 1 ? n : null;
  }

  return parseKanjiNumber(surface);
}

/** Parse kanji numerals in the 1–100 range (一, 十五, 二十三, 百, …). */
function parseKanjiNumber(surface: string): number | null {
  if (surface === '十') return 10;
  if (surface === '百') return 100;

  if (surface.includes('十')) {
    const [tensPart, onesPart] = surface.split('十');
    const tens = tensPart === '' ? 1 : KANJI_DIGITS[tensPart];
    const ones = onesPart === '' ? 0 : KANJI_DIGITS[onesPart];
    if (tens === undefined || ones === undefined) return null;
    return tens * 10 + ones;
  }

  return KANJI_DIGITS[surface] ?? null;
}

/** Reading of a single `digit + counter` unit (digit in 1–10 or 100). */
function readUnit(digit: number, def: CounterDef): string {
  const override = def.unitOverride?.[digit];
  if (override !== undefined) return override;

  const geminates = def.geminateAt.has(digit);
  if (geminates) {
    return GEMINATED[digit] + (def.geminate ?? def.base);
  }

  if (digit === 3 && def.voiced !== undefined) {
    return PLAIN[3] + def.voiced;
  }

  return PLAIN[digit] + def.base;
}

/** Compose the reading for an arbitrary supported number (1–100). */
function composeReading(n: number, def: CounterDef): string | null {
  const exact = def.exact?.[n];
  if (exact !== undefined) return exact;

  if (n >= 1 && n <= 10) return readUnit(n, def);
  if (n === 100) return readUnit(100, def);

  if (n > 10 && n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    if (ones === 0) {
      return PLAIN[tens] + readUnit(10, def);
    }
    const tensReading = (tens === 1 ? '' : PLAIN[tens]) + PLAIN[10];
    return tensReading + readUnit(ones, def);
  }

  return null;
}

/**
 * Returns the hiragana reading for a `number + counter` compound (e.g. ('3', '匹') → 'さんびき'),
 * or `null` when the counter is unknown or the number is unparseable / out of the 1–100 range.
 * Callers fall back to the tokenizer's reading when this returns `null`.
 */
export function counterReading(numberSurface: string, counterKanji: string): string | null {
  const def = COUNTERS[counterKanji];
  if (def === undefined) return null;

  const parsed = parseCounterNumber(numberSurface);
  if (parsed === null) return null;
  if (parsed === 'nan') return def.nan;

  return composeReading(parsed, def);
}

/** The set of counter kanji this module knows how to read. */
export function isKnownCounter(counterKanji: string): boolean {
  return counterKanji in COUNTERS;
}
