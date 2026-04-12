'use client';

import { Play, Pause, Rewind, FastForward, SkipBack, Repeat } from 'lucide-react';

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
    <div className="flex items-center justify-between w-full sm:w-auto sm:justify-start sm:gap-1">
      <button
        type="button"
        onClick={onRestart}
        aria-label="Restart"
        className="p-3 sm:p-1.5 rounded hover:bg-canvas-subtle text-muted hover:text-ink transition-colors"
      >
        <SkipBack className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
      </button>
      <button
        type="button"
        onClick={onRewind}
        aria-label="Rewind 5 seconds"
        className="p-3 sm:p-1.5 rounded hover:bg-canvas-subtle text-muted hover:text-ink transition-colors"
      >
        <Rewind className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
      </button>
      <button
        type="button"
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="p-3 sm:p-2 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
        ) : (
          <Play className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
        )}
      </button>
      <button
        type="button"
        onClick={onForward}
        aria-label="Forward 5 seconds"
        className="p-3 sm:p-1.5 rounded hover:bg-canvas-subtle text-muted hover:text-ink transition-colors"
      >
        <FastForward className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
      </button>
      <button
        type="button"
        onClick={onToggleLoop}
        aria-label="Toggle loop"
        aria-pressed={isLooping}
        className={`p-3 sm:p-1.5 rounded transition-colors ${
          isLooping
            ? 'text-primary bg-primary-subtle'
            : 'text-muted hover:bg-canvas-subtle hover:text-ink'
        }`}
      >
        <Repeat className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
      </button>
    </div>
  );
}
