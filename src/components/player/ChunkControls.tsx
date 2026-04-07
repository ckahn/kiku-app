'use client';

interface ChunkControlsProps {
  readonly isPlaying: boolean;
  readonly isLooping: boolean;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onRewind: () => void;
  readonly onForward: () => void;
  readonly onToggleLoop: () => void;
  readonly onExit: () => void;
}

export default function ChunkControls({
  isPlaying,
  isLooping,
  onPlay,
  onPause,
  onRewind,
  onForward,
  onToggleLoop,
  onExit,
}: ChunkControlsProps) {
  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        type="button"
        onClick={onRewind}
        aria-label="Rewind 5 seconds"
        className="p-1 rounded hover:bg-canvas-subtle text-muted hover:text-ink transition-colors text-sm"
      >
        ⏪
      </button>
      <button
        type="button"
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? 'Pause chunk' : 'Play chunk'}
        className="p-1.5 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors text-sm"
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button
        type="button"
        onClick={onForward}
        aria-label="Forward 5 seconds"
        className="p-1 rounded hover:bg-canvas-subtle text-muted hover:text-ink transition-colors text-sm"
      >
        ⏩
      </button>
      <button
        type="button"
        onClick={onToggleLoop}
        aria-label="Toggle loop"
        aria-pressed={isLooping}
        className={`p-1 rounded text-sm transition-colors ${
          isLooping
            ? 'text-primary bg-primary/10'
            : 'text-muted hover:bg-canvas-subtle hover:text-ink'
        }`}
      >
        🔁
      </button>
      <button
        type="button"
        onClick={onExit}
        aria-label="Exit chunk focus"
        className="ml-auto p-1 rounded hover:bg-canvas-subtle text-muted hover:text-ink transition-colors text-xs"
      >
        ✕
      </button>
    </div>
  );
}
