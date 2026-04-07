'use client';

import type { Chunk } from '@/db/schema';
import type { PlayerState } from './types';
import type { PlayerControls } from './usePlayer';
import { stripFurigana } from './chunkUtils';
import ChunkControls from './ChunkControls';
import FuriganaToggle from './FuriganaToggle';

interface ChunkItemProps {
  readonly chunk: Chunk;
  readonly isFocused: boolean;
  readonly isActive: boolean;
  readonly playerState: PlayerState;
  readonly controls: PlayerControls;
}

export default function ChunkItem({
  chunk,
  isFocused,
  isActive,
  playerState,
  controls,
}: ChunkItemProps) {
  const showFurigana = playerState.showFurigana[chunk.id] ?? false;
  const displayHtml = showFurigana ? chunk.textFurigana : stripFurigana(chunk.textFurigana);

  function handleClick() {
    if (!isFocused) {
      controls.focusChunk(chunk.id);
    }
  }

  return (
    <li
      data-chunk-id={chunk.id}
      data-focused={isFocused || undefined}
      data-active={isActive || undefined}
      onClick={handleClick}
      className={`rounded-lg border transition-all ${
        isFocused
          ? 'border-primary bg-surface shadow-sm p-4'
          : isActive
            ? 'border-primary/40 bg-primary/5 p-4 cursor-pointer hover:bg-primary/10'
            : 'border-border bg-surface p-4 cursor-pointer hover:border-primary/30 hover:bg-canvas-subtle'
      }`}
    >
      <p
        className="text-sm text-ink font-jp leading-loose"
        // textFurigana is Claude-generated HTML containing only <ruby>/<rt> tags.
        // It is not user-supplied input.
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />

      {isFocused && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <ChunkControls
              isPlaying={playerState.isPlaying}
              isLooping={playerState.isLooping}
              onPlay={controls.play}
              onPause={controls.pause}
              onRewind={controls.rewind}
              onForward={controls.forward}
              onToggleLoop={controls.toggleLoop}
              onExit={controls.unfocusChunk}
            />
          </div>
          <div className="mt-2">
            <FuriganaToggle
              chunkId={chunk.id}
              isOn={showFurigana}
              onToggle={controls.toggleFurigana}
            />
          </div>
        </div>
      )}
    </li>
  );
}
