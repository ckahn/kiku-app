import type {
  DeterministicTranscriptChunk,
  ElevenLabsWord,
  TranscriptSentence,
} from '@/lib/api/types';

const SENTENCE_END_TOKENS = new Set(['。', '！', '？', '!', '?']);

function toMilliseconds(value: number): number {
  return Math.round(value * 1000);
}

function buildSentence(
  words: readonly ElevenLabsWord[],
  firstWordIndex: number,
  lastWordIndex: number
): TranscriptSentence {
  const text = words
    .slice(firstWordIndex, lastWordIndex + 1)
    .map((word) => word.text)
    .join('');

  return {
    text,
    first_word_index: firstWordIndex,
    last_word_index: lastWordIndex,
    start_ms: toMilliseconds(words[firstWordIndex].startSecond),
    end_ms: toMilliseconds(words[lastWordIndex].endSecond),
  };
}

function createChunk(
  sentences: readonly TranscriptSentence[]
): DeterministicTranscriptChunk {
  return {
    text: sentences.map((sentence) => sentence.text).join(''),
    first_word_index: sentences[0].first_word_index,
    last_word_index: sentences[sentences.length - 1].last_word_index,
    sentences,
  };
}

export function splitTranscriptIntoSentences(
  words: readonly ElevenLabsWord[]
): readonly TranscriptSentence[] {
  if (words.length === 0) {
    return [];
  }

  const sentences: TranscriptSentence[] = [];
  let sentenceStartIndex = 0;

  for (const [index, word] of words.entries()) {
    if (!SENTENCE_END_TOKENS.has(word.text)) {
      continue;
    }

    sentences.push(buildSentence(words, sentenceStartIndex, index));
    sentenceStartIndex = index + 1;
  }

  if (sentenceStartIndex < words.length) {
    sentences.push(buildSentence(words, sentenceStartIndex, words.length - 1));
  }

  return sentences;
}

export function chunkSentencesByCharacterCount(
  sentences: readonly TranscriptSentence[],
  minimumCharacterCount: number
): readonly DeterministicTranscriptChunk[] {
  if (sentences.length === 0) {
    return [];
  }

  const chunks: DeterministicTranscriptChunk[] = [];
  let cursor = 0;

  while (cursor < sentences.length) {
    const nextChunkSentences: TranscriptSentence[] = [];
    let characterCount = 0;

    while (cursor < sentences.length && characterCount < minimumCharacterCount) {
      const sentence = sentences[cursor];
      nextChunkSentences.push(sentence);
      characterCount += sentence.text.length;
      cursor += 1;
    }

    chunks.push(createChunk(nextChunkSentences));
  }

  if (chunks.length === 1) {
    return chunks;
  }

  const lastChunk = chunks[chunks.length - 1];
  if (lastChunk.text.length >= minimumCharacterCount) {
    return chunks;
  }

  const mergedSentences = [
    ...chunks[chunks.length - 2].sentences,
    ...lastChunk.sentences,
  ];

  return [
    ...chunks.slice(0, -2),
    createChunk(mergedSentences),
  ];
}
