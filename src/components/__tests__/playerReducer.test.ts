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
      const s = state({ isPlaying: true, isLooping: true });
      const result = playerReducer(s, { type: 'SET_TIME', payload: 10 });
      expect(result.isPlaying).toBe(true);
      expect(result.isLooping).toBe(true);
    });
  });

  describe('TOGGLE_LOOP', () => {
    it('flips isLooping from false to true', () => {
      const result = playerReducer(state({ isLooping: false }), { type: 'TOGGLE_LOOP' });
      expect(result.isLooping).toBe(true);
    });

    it('flips isLooping from true to false', () => {
      const result = playerReducer(state({ isLooping: true }), { type: 'TOGGLE_LOOP' });
      expect(result.isLooping).toBe(false);
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
    it('starts paused, not looping, at time 0', () => {
      expect(initialPlayerState.isPlaying).toBe(false);
      expect(initialPlayerState.isLooping).toBe(false);
      expect(initialPlayerState.currentTime).toBe(0);
    });
  });
});
