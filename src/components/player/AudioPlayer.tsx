'use client';

import type { UsePlayerReturn } from './usePlayer';
import PlayerControls from './PlayerControls';
import ProgressBar from './ProgressBar';

interface AudioPlayerProps {
  readonly player: UsePlayerReturn;
  readonly onRestart?: () => void;
}

export default function AudioPlayer({ player, onRestart }: AudioPlayerProps) {
  const { state, controls, isLoading, durationSec, playbackError } = player;

  return (
    <div
      data-sticky-player
      className="sticky bottom-0 z-10 bg-surface border-t border-border px-4 pt-3 pb-6 sm:pb-3 shadow-sm"
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {playbackError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-md border border-error-subtle bg-error-subtle px-3 py-2 text-sm text-error-on-subtle sm:basis-full"
          >
            <span>{playbackError}</span>
            <button
              type="button"
              onClick={player.clearPlaybackError}
              aria-label="Dismiss error"
              className="shrink-0 cursor-pointer opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}
        <PlayerControls
          isPlaying={state.isPlaying}
          isLooping={state.loopRange !== null}
          onPlay={controls.play}
          onPause={controls.pause}
          onRewind={controls.rewind}
          onForward={controls.forward}
          onToggleLoop={controls.toggleLoop}
          onRestart={onRestart ?? controls.restart}
          disabled={isLoading}
        />
        {isLoading ? (
          <div className="flex flex-1 items-center gap-2 text-sm text-muted">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
            Loading audio…
          </div>
        ) : (
          <ProgressBar
            currentTime={state.currentTime}
            durationSec={durationSec}
            onSeek={controls.seek}
          />
        )}
      </div>
    </div>
  );
}
