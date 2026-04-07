import type { PlayerState, PlayerAction } from './types';

export const initialPlayerState: PlayerState = {
  mode: 'global',
  isPlaying: false,
  isLooping: false,
  focusedChunkId: null,
  showFurigana: {},
  currentTime: 0,
};

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'PLAY':
      return { ...state, isPlaying: true };

    case 'PAUSE':
      return { ...state, isPlaying: false };

    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying };

    case 'SET_TIME':
      return { ...state, currentTime: action.payload };

    case 'FOCUS_CHUNK':
      return {
        ...state,
        mode: 'chunk',
        focusedChunkId: action.payload,
      };

    case 'UNFOCUS_CHUNK':
      return {
        ...state,
        mode: 'global',
        focusedChunkId: null,
        isPlaying: false,
      };

    case 'TOGGLE_LOOP':
      return { ...state, isLooping: !state.isLooping };

    case 'TOGGLE_FURIGANA':
      return {
        ...state,
        showFurigana: {
          ...state.showFurigana,
          [action.payload]: !state.showFurigana[action.payload],
        },
      };

    case 'RESTART':
      return { ...state, currentTime: 0, isPlaying: false };

    default:
      return state;
  }
}
