import { describe, expect, it } from 'vitest';
import type { ElevenLabsWord } from '@/lib/api/types';
import {
  chunkSentencesByCharacterCount,
  splitTranscriptIntoSentences,
} from '@/lib/transcript-segmentation';

const PUNCTUATED_WORDS: ElevenLabsWord[] = [
  { text: '今日は', startSecond: 0, endSecond: 0.3 },
  { text: 'いい', startSecond: 0.3, endSecond: 0.5 },
  { text: '天気', startSecond: 0.5, endSecond: 0.8 },
  { text: 'です', startSecond: 0.8, endSecond: 1.0 },
  { text: '。', startSecond: 1.0, endSecond: 1.0 },
  { text: '散歩', startSecond: 1.2, endSecond: 1.5 },
  { text: 'に', startSecond: 1.5, endSecond: 1.6 },
  { text: '行き', startSecond: 1.6, endSecond: 1.9 },
  { text: 'ます', startSecond: 1.9, endSecond: 2.1 },
  { text: '！', startSecond: 2.1, endSecond: 2.1 },
];

describe('splitTranscriptIntoSentences()', () => {
  it('splits transcript words on Japanese sentence punctuation', () => {
    const sentences = splitTranscriptIntoSentences(PUNCTUATED_WORDS);

    expect(sentences).toEqual([
      {
        text: '今日はいい天気です。',
        first_word_index: 0,
        last_word_index: 4,
        start_ms: 0,
        end_ms: 1000,
      },
      {
        text: '散歩に行きます！',
        first_word_index: 5,
        last_word_index: 9,
        start_ms: 1200,
        end_ms: 2100,
      },
    ]);
  });

  it('keeps trailing text as a final sentence when punctuation is missing', () => {
    const words: ElevenLabsWord[] = [
      { text: 'まだ', startSecond: 0, endSecond: 0.2 },
      { text: '途中', startSecond: 0.2, endSecond: 0.5 },
    ];

    expect(splitTranscriptIntoSentences(words)).toEqual([
      {
        text: 'まだ途中',
        first_word_index: 0,
        last_word_index: 1,
        start_ms: 0,
        end_ms: 500,
      },
    ]);
  });

  it('supports ASCII sentence punctuation', () => {
    const words: ElevenLabsWord[] = [
      { text: 'Hello', startSecond: 0, endSecond: 0.3 },
      { text: '?', startSecond: 0.3, endSecond: 0.3 },
      { text: 'Yes', startSecond: 0.5, endSecond: 0.8 },
      { text: '!', startSecond: 0.8, endSecond: 0.8 },
    ];

    expect(splitTranscriptIntoSentences(words).map((sentence) => sentence.text)).toEqual([
      'Hello?',
      'Yes!',
    ]);
  });
});

describe('chunkSentencesByCharacterCount()', () => {
  it('groups complete sentences until the chunk reaches the minimum length', () => {
    const sentences = splitTranscriptIntoSentences(PUNCTUATED_WORDS);

    expect(chunkSentencesByCharacterCount(sentences, 12)).toEqual([
      {
        text: '今日はいい天気です。散歩に行きます！',
        first_word_index: 0,
        last_word_index: 9,
        sentences,
      },
    ]);
  });

  it('emits a single long sentence as its own chunk', () => {
    const sentences = [
      {
        text: 'これは三十文字を超える十分に長い文です。',
        first_word_index: 0,
        last_word_index: 6,
        start_ms: 0,
        end_ms: 1800,
      },
    ];

    expect(chunkSentencesByCharacterCount(sentences, 30)).toEqual([
      {
        text: 'これは三十文字を超える十分に長い文です。',
        first_word_index: 0,
        last_word_index: 6,
        sentences,
      },
    ]);
  });

  it('merges a short trailing chunk into the previous chunk', () => {
    const sentences = [
      {
        text: '最初の文は十分に長い文章です。',
        first_word_index: 0,
        last_word_index: 4,
        start_ms: 0,
        end_ms: 1000,
      },
      {
        text: '短い。',
        first_word_index: 5,
        last_word_index: 6,
        start_ms: 1200,
        end_ms: 1500,
      },
    ];

    expect(chunkSentencesByCharacterCount(sentences, 10)).toEqual([
      {
        text: '最初の文は十分に長い文章です。短い。',
        first_word_index: 0,
        last_word_index: 6,
        sentences,
      },
    ]);
  });
});
