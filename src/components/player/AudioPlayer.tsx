'use client';

import { useState } from 'react';
import type { UsePlayerReturn } from './usePlayer';
import PlayerControls from './PlayerControls';
import ProgressBar from './ProgressBar';

interface AudioPlayerProps {
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly player: UsePlayerReturn;
}

export default function AudioPlayer({ audioUrl, durationMs, player }: AudioPlayerProps) {
  const { state, controls, setAudioEl } = player;
  const [audioDurationSec, setAudioDurationSec] = useState(durationMs > 0 ? durationMs / 1000 : 0);

  return (
    <div className="sticky bottom-0 z-10 bg-surface border-t border-border px-4 py-3 shadow-sm">
      {/* Hidden audio element — the single source of truth for playback */}
      <audio
        ref={setAudioEl}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={(e) => setAudioDurationSec((e.target as HTMLAudioElement).duration)}
        aria-hidden="true"
        className="hidden"
      />
      <div className="max-w-2xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <PlayerControls
          isPlaying={state.isPlaying}
          isLooping={state.isLooping}
          onPlay={controls.play}
          onPause={controls.pause}
          onRewind={controls.rewind}
          onForward={controls.forward}
          onToggleLoop={controls.toggleLoop}
          onRestart={controls.restart}
        />
        <ProgressBar
          currentTime={state.currentTime}
          durationSec={audioDurationSec}
          onSeek={controls.seek}
        />
      </div>
    </div>
  );
}
