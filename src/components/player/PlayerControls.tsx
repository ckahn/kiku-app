'use client';

interface PlayerControlsProps {
  readonly isPlaying: boolean;
  readonly isLooping: boolean;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onRewind: () => void;
  readonly onForward: () => void;
  readonly onToggleLoop: () => void;
  readonly onRestart: () => void;
}

export default function PlayerControls({
  isPlaying,
  isLooping,
  onPlay,
  onPause,
  onRewind,
  onForward,
  onToggleLoop,
  onRestart,
}: PlayerControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onRestart}
        aria-label="Restart"
        className="p-1.5 rounded hover:bg-canvas-subtle text-muted hover:text-ink transition-colors"
      >
        ⏮
      </button>
      <button
        type="button"
        onClick={onRewind}
        aria-label="Rewind 5 seconds"
        className="p-1.5 rounded hover:bg-canvas-subtle text-muted hover:text-ink transition-colors"
      >
        ⏪
      </button>
      <button
        type="button"
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="p-2 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors"
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button
        type="button"
        onClick={onForward}
        aria-label="Forward 5 seconds"
        className="p-1.5 rounded hover:bg-canvas-subtle text-muted hover:text-ink transition-colors"
      >
        ⏩
      </button>
      <button
        type="button"
        onClick={onToggleLoop}
        aria-label="Toggle loop"
        aria-pressed={isLooping}
        className={`p-1.5 rounded transition-colors ${
          isLooping
            ? 'text-primary bg-primary/10'
            : 'text-muted hover:bg-canvas-subtle hover:text-ink'
        }`}
      >
        🔁
      </button>
    </div>
  );
}
