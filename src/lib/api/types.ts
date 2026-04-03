// ElevenLabs Scribe v2 API types

export interface ElevenLabsWord {
  readonly text: string;
  readonly start: number; // seconds (float)
  readonly end: number; // seconds (float)
  readonly type: string; // 'word' | 'spacing' | 'punctuation' — use string for forward-compat
  readonly speaker_id: string;
  readonly logprob: number;
}

export interface ElevenLabsTranscript {
  readonly language_code: string;
  readonly language_probability: number;
  readonly text: string;
  readonly words: readonly ElevenLabsWord[];
}

// Claude chunking API types

export interface TranscriptChunk {
  readonly text: string;
  readonly first_word_index: number;
  readonly last_word_index: number;
}

export interface ChunkWithFurigana {
  readonly text: string;
  readonly text_furigana: string; // HTML with <ruby> annotations (kanji only)
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
