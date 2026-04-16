// Claude model identifiers — update here when Anthropic releases new versions.
// Chunking and furigana both benefit from strong instruction-following.
// TODO: Revisit furigana model quality once the audio pipeline is faster overall.
export const CLAUDE_CHUNK_MODEL = 'claude-sonnet-4-20250514';
export const CLAUDE_FURIGANA_MODEL = 'claude-haiku-4-5-20251001';
export const CLAUDE_STUDY_GUIDE_MODEL = 'claude-sonnet-4-20250514';
export const TRANSCRIPT_SEGMENTATION_STRATEGY = 'deterministic';
export const MINIMUM_CHUNK_CHARACTERS = 30;
export const STUDY_GUIDE_CONTEXT_CHUNKS = 10;
export const STUDY_GUIDE_CURRENT_VERSION = 2;

export const STATUS_COLORS: Record<string, string> = {
  uploaded:     'bg-info-subtle text-info-on-subtle',
  transcribing: 'bg-warning-subtle text-warning-on-subtle',
  chunking:     'bg-warning-subtle text-warning-on-subtle',
  ready:        'bg-success-subtle text-success-on-subtle',
  error:        'bg-error-subtle text-error-on-subtle',
};
