'use client';

import { Play, Pause, Rewind, FastForward, SkipBack, Repeat } from 'lucide-react';

interface PlayerControlsProps {
  readonly isPlaying: boolean;
  readonly isLooping: boolean;
  readonly loopLength: number;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onRewind: () => void;
  readonly onForward: () => void;
  readonly onToggleLoop: () => void;
  readonly onRestart: () => void;
  readonly disabled?: boolean;
}

const PLAYER_CONTROL_BUTTON_CLASS = 'cursor-pointer p-3 transition-colors sm:p-1.5';

export default function PlayerControls({
  isPlaying,
  isLooping,
  loopLength,
  onPlay,
  onPause,
  onRewind,
  onForward,
  onToggleLoop,
  onRestart,
  disabled = false,
}: PlayerControlsProps) {
  return (
    <div className="flex items-center justify-between w-full sm:w-auto sm:justify-start sm:gap-1">
      <button
        type="button"
        onClick={onRestart}
        aria-label="Restart"
        disabled={disabled}
        className={`${PLAYER_CONTROL_BUTTON_CLASS} rounded text-muted hover:bg-canvas-subtle hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <SkipBack className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
      </button>
      <button
        type="button"
        onClick={onRewind}
        aria-label="Rewind 5 seconds"
        disabled={disabled}
        className={`${PLAYER_CONTROL_BUTTON_CLASS} rounded text-muted hover:bg-canvas-subtle hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <Rewind className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
      </button>
      <button
        type="button"
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        disabled={disabled}
        className="cursor-pointer rounded-full bg-primary p-3 text-white transition-colors hover:bg-primary-hover sm:p-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
        disabled={disabled}
        className={`${PLAYER_CONTROL_BUTTON_CLASS} rounded text-muted hover:bg-canvas-subtle hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <FastForward className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
      </button>
      <button
        type="button"
        onClick={onToggleLoop}
        aria-label="Toggle loop"
        aria-pressed={isLooping}
        disabled={disabled}
        className={`${PLAYER_CONTROL_BUTTON_CLASS} rounded disabled:opacity-40 disabled:cursor-not-allowed ${
          isLooping
            ? 'text-primary bg-primary-subtle'
            : 'text-muted hover:bg-canvas-subtle hover:text-ink'
        }`}
      >
        <Repeat className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
      </button>
      {isLooping && loopLength > 0 && (
        <span
          aria-label={`Looping ${loopLength} segment${loopLength !== 1 ? 's' : ''}`}
          className="text-primary text-xs font-medium whitespace-nowrap pl-1"
        >
          <span className="sm:hidden">{loopLength}</span>
          <span className="hidden sm:inline">
            Looping · {loopLength} segment{loopLength !== 1 ? 's' : ''}
          </span>
        </span>
      )}
    </div>
  );
}
