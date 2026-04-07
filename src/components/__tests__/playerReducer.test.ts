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

  describe('FOCUS_CHUNK', () => {
    it('sets mode to chunk and focusedChunkId', () => {
      const result = playerReducer(state(), { type: 'FOCUS_CHUNK', payload: 7 });
      expect(result.mode).toBe('chunk');
      expect(result.focusedChunkId).toBe(7);
    });

    it('switching focus preserves isPlaying and isLooping', () => {
      const s = state({ isPlaying: true, isLooping: true });
      const result = playerReducer(s, { type: 'FOCUS_CHUNK', payload: 3 });
      expect(result.isPlaying).toBe(true);
      expect(result.isLooping).toBe(true);
    });

    it('can refocus a different chunk while already in chunk mode', () => {
      const s = state({ mode: 'chunk', focusedChunkId: 1 });
      const result = playerReducer(s, { type: 'FOCUS_CHUNK', payload: 2 });
      expect(result.focusedChunkId).toBe(2);
      expect(result.mode).toBe('chunk');
    });
  });

  describe('UNFOCUS_CHUNK', () => {
    it('returns to global mode and clears focusedChunkId', () => {
      const s = state({ mode: 'chunk', focusedChunkId: 5, isPlaying: true });
      const result = playerReducer(s, { type: 'UNFOCUS_CHUNK' });
      expect(result.mode).toBe('global');
      expect(result.focusedChunkId).toBeNull();
    });

    it('stops playback when unfocusing', () => {
      const s = state({ mode: 'chunk', focusedChunkId: 5, isPlaying: true });
      const result = playerReducer(s, { type: 'UNFOCUS_CHUNK' });
      expect(result.isPlaying).toBe(false);
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

    it('loop toggle is independent of mode', () => {
      const globalResult = playerReducer(state({ mode: 'global' }), { type: 'TOGGLE_LOOP' });
      const chunkResult = playerReducer(state({ mode: 'chunk' }), { type: 'TOGGLE_LOOP' });
      expect(globalResult.isLooping).toBe(true);
      expect(chunkResult.isLooping).toBe(true);
    });
  });

  describe('TOGGLE_FURIGANA', () => {
    it('toggles furigana on for a chunk that has no entry yet (defaults to false)', () => {
      const result = playerReducer(state(), { type: 'TOGGLE_FURIGANA', payload: 3 });
      expect(result.showFurigana[3]).toBe(true);
    });

    it('toggles furigana off when already on', () => {
      const s = state({ showFurigana: { 3: true } });
      const result = playerReducer(s, { type: 'TOGGLE_FURIGANA', payload: 3 });
      expect(result.showFurigana[3]).toBe(false);
    });

    it('does not affect other chunks when toggling one', () => {
      const s = state({ showFurigana: { 1: true, 2: false } });
      const result = playerReducer(s, { type: 'TOGGLE_FURIGANA', payload: 1 });
      expect(result.showFurigana[2]).toBe(false);
    });

    it('produces a new showFurigana object (immutable)', () => {
      const s = state({ showFurigana: { 1: false } });
      const result = playerReducer(s, { type: 'TOGGLE_FURIGANA', payload: 1 });
      expect(result.showFurigana).not.toBe(s.showFurigana);
    });
  });

  describe('RESTART', () => {
    it('resets currentTime to 0 and stops playback', () => {
      const s = state({ currentTime: 120, isPlaying: true });
      const result = playerReducer(s, { type: 'RESTART' });
      expect(result.currentTime).toBe(0);
      expect(result.isPlaying).toBe(false);
    });

    it('preserves mode and focusedChunkId', () => {
      const s = state({ mode: 'chunk', focusedChunkId: 4 });
      const result = playerReducer(s, { type: 'RESTART' });
      expect(result.mode).toBe('chunk');
      expect(result.focusedChunkId).toBe(4);
    });
  });

  describe('initialPlayerState', () => {
    it('starts in global mode, paused, not looping', () => {
      expect(initialPlayerState.mode).toBe('global');
      expect(initialPlayerState.isPlaying).toBe(false);
      expect(initialPlayerState.isLooping).toBe(false);
      expect(initialPlayerState.focusedChunkId).toBeNull();
      expect(initialPlayerState.currentTime).toBe(0);
    });
  });
});
