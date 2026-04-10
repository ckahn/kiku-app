// Claude model identifiers — update here when Anthropic releases new versions.
// Chunking and furigana both benefit from strong instruction-following.
// NOTE: CLAUDE_FURIGANA_MODEL uses Sonnet (not Haiku) for structured span output quality.
// Worst case: one Sonnet batch call + one retry per failing chunk. Monitor cost at scale.
export const CLAUDE_CHUNK_MODEL = 'claude-sonnet-4-20250514';
export const CLAUDE_FURIGANA_MODEL = 'claude-sonnet-4-20250514';

export const STATUS_COLORS: Record<string, string> = {
  uploaded:     'bg-info-subtle text-info-on-subtle',
  transcribing: 'bg-warning-subtle text-warning-on-subtle',
  chunking:     'bg-warning-subtle text-warning-on-subtle',
  ready:        'bg-success-subtle text-success-on-subtle',
  error:        'bg-error-subtle text-error-on-subtle',
};
