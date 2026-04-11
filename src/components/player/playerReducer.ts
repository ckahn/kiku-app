import type { PlayerState, PlayerAction } from './types';

export const initialPlayerState: PlayerState = {
  isPlaying: false,
  isLooping: false,
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

    case 'TOGGLE_LOOP':
      return { ...state, isLooping: !state.isLooping };

    case 'RESTART':
      return { ...state, currentTime: action.payload, isPlaying: false };

    default:
      return state;
  }
}
