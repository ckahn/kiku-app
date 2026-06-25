import { describe, it, expect } from 'vitest';
import { playerReducer, initialPlayerState } from '../player/playerReducer';
import type { PlayerState } from '../player/types';

function state(overrides: Partial<PlayerState> = {}): PlayerState {
  return { ...initialPlayerState, ...overrides };
}

describe('playerReducer', () => {
  describe('PLAY', () => {
    it('sets isPlaying to true', () => {
      const result = playerReducer(state({ isPlaying: false }), { type: 'PLAY' });
      expect(result.isPlaying).toBe(true);
    });

    it('does not mutate existing state', () => {
      const original = state({ isPlaying: false });
      const result = playerReducer(original, { type: 'PLAY' });
      expect(result).not.toBe(original);
      expect(original.isPlaying).toBe(false);
    });
  });

  describe('PAUSE', () => {
    it('sets isPlaying to false', () => {
      const result = playerReducer(state({ isPlaying: true }), { type: 'PAUSE' });
      expect(result.isPlaying).toBe(false);
    });
  });

  describe('TOGGLE_PLAY', () => {
    it('flips isPlaying from false to true', () => {
      const result = playerReducer(state({ isPlaying: false }), { type: 'TOGGLE_PLAY' });
      expect(result.isPlaying).toBe(true);
    });

    it('flips isPlaying from true to false', () => {
      const result = playerReducer(state({ isPlaying: true }), { type: 'TOGGLE_PLAY' });
      expect(result.isPlaying).toBe(false);
    });
  });

  describe('SET_TIME', () => {
    it('updates currentTime', () => {
      const result = playerReducer(state(), { type: 'SET_TIME', payload: 42.5 });
      expect(result.currentTime).toBe(42.5);
    });

    it('preserves other state fields', () => {
      const loop = { firstSegmentId: 1, lastSegmentId: 2 };
      const s = state({ isPlaying: true, loopRange: loop });
      const result = playerReducer(s, { type: 'SET_TIME', payload: 10 });
      expect(result.isPlaying).toBe(true);
      expect(result.loopRange).toEqual(loop);
    });
  });

  describe('SET_LOOP', () => {
    it('stores a range', () => {
      const range = { firstSegmentId: 1, lastSegmentId: 3 };
      const result = playerReducer(state(), { type: 'SET_LOOP', range });
      expect(result.loopRange).toEqual(range);
    });

    it('clears the range when given null', () => {
      const s = state({ loopRange: { firstSegmentId: 1, lastSegmentId: 1 } });
      const result = playerReducer(s, { type: 'SET_LOOP', range: null });
      expect(result.loopRange).toBeNull();
    });

    it('does not mutate the previous state', () => {
      const original = state();
      playerReducer(original, { type: 'SET_LOOP', range: { firstSegmentId: 2, lastSegmentId: 4 } });
      expect(original.loopRange).toBeNull();
    });
  });

  describe('RESTART', () => {
    it('sets currentTime to payload and stops playback', () => {
      const s = state({ currentTime: 120, isPlaying: true });
      const result = playerReducer(s, { type: 'RESTART', payload: 5 });
      expect(result.currentTime).toBe(5);
      expect(result.isPlaying).toBe(false);
    });
  });

  describe('initialPlayerState', () => {
    it('starts paused, with no loop range, at time 0', () => {
      expect(initialPlayerState.isPlaying).toBe(false);
      expect(initialPlayerState.loopRange).toBeNull();
      expect(initialPlayerState.currentTime).toBe(0);
    });
  });
});
