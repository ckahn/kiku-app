import { describe, it, expect } from 'vitest';
import { playerReducer, initialPlayerState } from '../playerReducer';

describe('playerReducer', () => {
  it('initial state has loopRange null', () => {
    expect(initialPlayerState.loopRange).toBeNull();
  });

  it('SET_LOOP stores a range', () => {
    const range = { firstSegmentId: 1, lastSegmentId: 3 };
    const state = playerReducer(initialPlayerState, { type: 'SET_LOOP', range });
    expect(state.loopRange).toEqual(range);
  });

  it('SET_LOOP with null clears the range', () => {
    const withRange = { ...initialPlayerState, loopRange: { firstSegmentId: 1, lastSegmentId: 1 } };
    const state = playerReducer(withRange, { type: 'SET_LOOP', range: null });
    expect(state.loopRange).toBeNull();
  });

  it('SET_LOOP does not mutate the previous state', () => {
    const range = { firstSegmentId: 2, lastSegmentId: 4 };
    playerReducer(initialPlayerState, { type: 'SET_LOOP', range });
    expect(initialPlayerState.loopRange).toBeNull();
  });

  it('PLAY sets isPlaying true', () => {
    const state = playerReducer(initialPlayerState, { type: 'PLAY' });
    expect(state.isPlaying).toBe(true);
  });

  it('PAUSE sets isPlaying false', () => {
    const playing = { ...initialPlayerState, isPlaying: true };
    const state = playerReducer(playing, { type: 'PAUSE' });
    expect(state.isPlaying).toBe(false);
  });
});
