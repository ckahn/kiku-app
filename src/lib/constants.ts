// Claude model identifiers — update here when Anthropic releases new versions.
// Segmenting and furigana both benefit from strong instruction-following.
// TODO: Revisit furigana model quality once the audio pipeline is faster overall.
export const CLAUDE_SEGMENT_MODEL = 'claude-sonnet-4-6';
export const CLAUDE_FURIGANA_MODEL = 'claude-haiku-4-5';
export const CLAUDE_STUDY_GUIDE_MODEL = 'claude-sonnet-4-6';
export const TRANSCRIPT_SEGMENTATION_STRATEGY = 'deterministic';
// Furigana source: 'tokenizer' (kuromoji, deterministic) or 'llm' (Claude, fallback).
export const FURIGANA_STRATEGY: 'tokenizer' | 'llm' = 'tokenizer';
export const MINIMUM_SEGMENT_CHARACTERS = 30;
// Playback engine: 'media-element' (native <audio> fed from a one-time full
// download — screen-off playback, media notification, native pitch-preserving
// speed) or 'web-audio' (decode-once AudioBuffer + SoundTouch, sample-accurate
// loops). See src/lib/audio/.
export const AUDIO_ENGINE_STRATEGY: 'media-element' | 'web-audio' = 'media-element';
export const SEGMENT_PLAYBACK_OFFSET_SEC = 0.1; // start playback slightly before the stored timestamp
export const STUDY_GUIDE_CONTEXT_SEGMENTS = 10;
export const STUDY_GUIDE_CURRENT_VERSION = 2;

export const STATUS_COLORS: Record<string, string> = {
  uploaded:     'bg-info-subtle text-info-on-subtle',
  transcribing: 'bg-warning-subtle text-warning-on-subtle',
  segmenting:     'bg-warning-subtle text-warning-on-subtle',
  ready:        'bg-success-subtle text-success-on-subtle',
  error:        'bg-error-subtle text-error-on-subtle',
};
