export type PlayerState = {
  readonly isPlaying: boolean;
  readonly isLooping: boolean;
  readonly currentTime: number;
};

export type PlayerAction =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_TIME'; payload: number }
  | { type: 'TOGGLE_LOOP' }
  | { type: 'RESTART'; payload: number };
