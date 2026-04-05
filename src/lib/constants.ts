// Claude model identifiers — update here when Anthropic releases new versions.
// Chunking needs strong instruction-following; furigana is mechanical and uses Haiku.
export const CLAUDE_CHUNK_MODEL = 'claude-sonnet-4-20250514';
export const CLAUDE_FURIGANA_MODEL = 'claude-haiku-4-5-20251001';

export const STATUS_COLORS: Record<string, string> = {
  uploaded:     'bg-info-subtle text-info-on-subtle',
  transcribing: 'bg-warning-subtle text-warning-on-subtle',
  chunking:     'bg-warning-subtle text-warning-on-subtle',
  ready:        'bg-success-subtle text-success-on-subtle',
  error:        'bg-error-subtle text-error-on-subtle',
};
