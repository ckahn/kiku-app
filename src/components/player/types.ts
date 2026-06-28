import type { LoopRange } from './loopRange';

export type PlayerState = {
  readonly isPlaying: boolean;
  readonly loopRange: LoopRange | null;
  readonly currentTime: number;
};

export type PlayerAction =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_TIME'; payload: number }
  | { type: 'SET_LOOP'; range: LoopRange | null }
  | { type: 'RESTART'; payload: number };
