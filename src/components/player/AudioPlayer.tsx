'use client';

import type { UsePlayerReturn } from './usePlayer';
import PlayerControls from './PlayerControls';
import ProgressBar from './ProgressBar';

interface AudioPlayerProps {
  readonly durationMs: number;
  readonly player: UsePlayerReturn;
}

export default function AudioPlayer({ durationMs, player }: AudioPlayerProps) {
  const { state, controls, isLoading, playbackError } = player;

  return (
    <div
      data-sticky-player
      className="sticky bottom-0 z-10 bg-surface border-t border-border px-4 pt-3 pb-6 sm:pb-3 shadow-sm"
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {playbackError && (
          <p
            role="alert"
            className="rounded-md border border-error-subtle bg-error-subtle px-3 py-2 text-sm text-error-on-subtle sm:basis-full"
          >
            {playbackError}
          </p>
        )}
        <PlayerControls
          isPlaying={state.isPlaying}
          isLooping={state.isLooping}
          onPlay={controls.play}
          onPause={controls.pause}
          onRewind={controls.rewind}
          onForward={controls.forward}
          onToggleLoop={controls.toggleLoop}
          onRestart={controls.restart}
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
            durationSec={durationMs / 1000}
            onSeek={controls.seek}
          />
        )}
      </div>
    </div>
  );
}
