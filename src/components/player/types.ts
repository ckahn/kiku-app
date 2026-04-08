export type PlayerMode = 'global' | 'chunk';

export type PlayerState = {
  readonly mode: PlayerMode;
  readonly isPlaying: boolean;
  readonly isLooping: boolean;
  readonly focusedChunkId: number | null;
  readonly showFurigana: Readonly<Record<number, boolean>>;
  readonly currentTime: number;
};

export type PlayerAction =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_TIME'; payload: number }
  | { type: 'FOCUS_CHUNK'; payload: number }
  | { type: 'UNFOCUS_CHUNK' }
  | { type: 'TOGGLE_LOOP' }
  | { type: 'TOGGLE_FURIGANA'; payload: number }
  | { type: 'RESTART'; payload: number };
