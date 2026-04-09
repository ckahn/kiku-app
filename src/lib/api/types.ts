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

export interface ChunkWithFurigana {
  readonly text: string;
  readonly text_furigana: string; // HTML where <ruby> is allowed only around kanji-only base text
  readonly first_word_index: number;
  readonly last_word_index: number;
}

// Claude drill-down API types

export interface GrammarExample {
  readonly ja: string;
  readonly en: string;
}

export interface GrammarStructure {
  readonly pattern: string;
  readonly explanation: string;
  readonly example: GrammarExample;
}

export interface DrilldownSentence {
  readonly japanese: string;
  readonly english: string;
  readonly structures: readonly GrammarStructure[];
}

export interface DrilldownContent {
  readonly sentences: readonly DrilldownSentence[];
}
