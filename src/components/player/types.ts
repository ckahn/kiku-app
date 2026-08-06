import type { Segment } from '@/db/schema';

// The subset of a DB Segment row the player surfaces actually read. Both the
// RSC episode page (full Segment rows) and the offline shell (IndexedDB-derived
// rows without episodeId/createdAt/...) satisfy this shape.
export type PlayerSegment = Pick<
  Segment,
  | 'id'
  | 'segmentIndex'
  | 'textRaw'
  | 'textFurigana'
  | 'furiganaStatus'
  | 'furiganaWarning'
  | 'startMs'
  | 'endMs'
  | 'studyStatus'
  | 'sentences'
>;

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
