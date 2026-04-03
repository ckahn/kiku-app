import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TranscriptChunk, ElevenLabsWord } from '../types';

const DUMMY_WORDS: ElevenLabsWord[] = [
  { text: 'テスト', start: 0, end: 0.5, type: 'word', speaker_id: 'speaker_0', logprob: -0.1 },
];

const DUMMY_CHUNKS: TranscriptChunk[] = [
  { text: 'テスト', first_word_index: 0, last_word_index: 0 },
];

describe('chunkTranscript() — mock mode', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an array of chunks with required fields', async () => {
    const { chunkTranscript } = await import('../claude');
    const result = await chunkTranscript('テスト', DUMMY_WORDS);
    expect(Array.isArray(result)).toBe(true);
    for (const chunk of result) {
      expect(chunk).toHaveProperty('text');
      expect(chunk).toHaveProperty('first_word_index');
      expect(chunk).toHaveProperty('last_word_index');
    }
  });

  it('does not mutate the input words array', async () => {
    const { chunkTranscript } = await import('../claude');
    const inputWords = [...DUMMY_WORDS];
    await chunkTranscript('テスト', inputWords);
    expect(inputWords).toStrictEqual(DUMMY_WORDS);
  });
});

describe('addFurigana() — mock mode', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the same number of entries as input chunks', async () => {
    const { chunkTranscript, addFurigana } = await import('../claude');
    const chunks = await chunkTranscript('', DUMMY_WORDS);
    const result = await addFurigana(chunks);
    expect(result.length).toBe(chunks.length);
  });

  it('each result has text, text_furigana, first_word_index, last_word_index', async () => {
    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);
    for (const entry of result) {
      expect(entry).toHaveProperty('text');
      expect(entry).toHaveProperty('text_furigana');
      expect(entry).toHaveProperty('first_word_index');
      expect(entry).toHaveProperty('last_word_index');
    }
  });

  it('each text_furigana contains at least one <ruby> annotation', async () => {
    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);
    for (const entry of result) {
      expect(entry.text_furigana).toContain('<ruby');
    }
  });

  it('does not mutate the input chunks array', async () => {
    const { addFurigana } = await import('../claude');
    const inputChunks = [...DUMMY_CHUNKS];
    await addFurigana(inputChunks);
    expect(inputChunks).toStrictEqual(DUMMY_CHUNKS);
  });
});

describe('generateDrilldown() — mock mode', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an object with a non-empty sentences array', async () => {
    const { generateDrilldown } = await import('../claude');
    const result = await generateDrilldown('テスト');
    expect(result).toHaveProperty('sentences');
    expect(Array.isArray(result.sentences)).toBe(true);
    expect(result.sentences.length).toBeGreaterThan(0);
  });

  it('each sentence has japanese, english, and structures', async () => {
    const { generateDrilldown } = await import('../claude');
    const result = await generateDrilldown('テスト');
    for (const sentence of result.sentences) {
      expect(sentence).toHaveProperty('japanese');
      expect(sentence).toHaveProperty('english');
      expect(sentence).toHaveProperty('structures');
    }
  });
});

describe('API wrappers — non-mock mode stubs', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('chunkTranscript throws with clear message', async () => {
    const { chunkTranscript } = await import('../claude');
    await expect(chunkTranscript('', [])).rejects.toThrow(
      'Real Claude API not yet implemented'
    );
  });

  it('addFurigana throws with clear message', async () => {
    const { addFurigana } = await import('../claude');
    await expect(addFurigana([])).rejects.toThrow(
      'Real Claude API not yet implemented'
    );
  });

  it('generateDrilldown throws with clear message', async () => {
    const { generateDrilldown } = await import('../claude');
    await expect(generateDrilldown('')).rejects.toThrow(
      'Real Claude API not yet implemented'
    );
  });
});
