'use client';

interface FuriganaToggleProps {
  readonly chunkId: number;
  readonly isOn: boolean;
  readonly onToggle: (chunkId: number) => void;
}

export default function FuriganaToggle({ chunkId, isOn, onToggle }: FuriganaToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(chunkId)}
      aria-pressed={isOn}
      aria-label={isOn ? 'Hide furigana' : 'Show furigana'}
      className={`text-xs px-2 py-1 rounded border transition-colors ${
        isOn
          ? 'border-primary text-primary bg-primary/10'
          : 'border-border text-muted hover:border-primary hover:text-primary'
      }`}
    >
      ふりがな
    </button>
  );
}
