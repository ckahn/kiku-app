// ElevenLabs transcription types — shaped to match the Vercel AI SDK segment format

export interface ElevenLabsWord {
  readonly text: string;
  readonly startSecond: number; // seconds (float)
  readonly endSecond: number; // seconds (float)
}

export interface ElevenLabsTranscript {
  readonly language_code: string;
  readonly language_probability: number;
  readonly text: string;
  readonly segments: readonly ElevenLabsWord[];
}

// Claude chunking API types

export interface TranscriptChunk {
  readonly text: string;
  readonly first_word_index: number;
  readonly last_word_index: number;
}

export interface TranscriptSentence {
  readonly text: string;
  readonly first_word_index: number;
  readonly last_word_index: number;
  readonly start_ms: number;
  readonly end_ms: number;
}

export interface DeterministicTranscriptChunk extends TranscriptChunk {
  readonly sentences: readonly TranscriptSentence[];
}

export interface FuriganaSpan {
  readonly surface: string;
  readonly reading: string | null;
}

export type FuriganaStatus = 'ok' | 'suspect';

export interface ChunkWithFurigana {
  readonly text: string;
  readonly text_furigana: string; // HTML where <ruby> is allowed only around kanji-only base text
  readonly first_word_index: number;
  readonly last_word_index: number;
  readonly furigana_status: FuriganaStatus;
  readonly furigana_warning: string | null;
}

// Claude study guide API types

export interface StudyGuideVocabularyItem {
  readonly id: string;
  readonly japanese: string;
  readonly reading: string | null;
  readonly meaning: string;
}

export interface StudyGuideStructureItem {
  readonly id: string;
  readonly pattern: string;
  readonly reading: string | null;
  readonly meaning: string;
  readonly note?: string;
}

export interface StudyGuideBreakdownSegment {
  readonly id: string;
  readonly japanese: string;
  readonly cue: string;
  readonly order: number;
}

export interface StudyGuideContent {
  readonly version: 2;
  readonly vocabulary: readonly StudyGuideVocabularyItem[];
  readonly structures: readonly StudyGuideStructureItem[];
  readonly breakdown: readonly StudyGuideBreakdownSegment[];
  readonly translation: {
    readonly fullEnglish: string;
  };
}
