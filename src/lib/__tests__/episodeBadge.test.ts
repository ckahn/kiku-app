import { describe, it, expect } from 'vitest';
import { getEpisodeBadge } from '@/lib/episodeBadge';

describe('getEpisodeBadge', () => {
  describe('pipeline error — always wins', () => {
    it('returns error badge regardless of study status', () => {
      expect(getEpisodeBadge({ status: 'error', studyStatus: 'new' })).toEqual({ variant: 'error', label: 'Error' });
      expect(getEpisodeBadge({ status: 'error', studyStatus: 'studying' })).toEqual({ variant: 'error', label: 'Error' });
      expect(getEpisodeBadge({ status: 'error', studyStatus: 'learned' })).toEqual({ variant: 'error', label: 'Error' });
    });
  });

  describe('pipeline in-progress — overrides study status', () => {
    it('returns processing badge for uploaded', () => {
      expect(getEpisodeBadge({ status: 'uploaded', studyStatus: 'new' })).toEqual({ variant: 'warning', label: 'Processing…' });
    });

    it('returns processing badge for transcribing', () => {
      expect(getEpisodeBadge({ status: 'transcribing', studyStatus: 'new' })).toEqual({ variant: 'warning', label: 'Processing…' });
    });

    it('returns processing badge for chunking', () => {
      expect(getEpisodeBadge({ status: 'chunking', studyStatus: 'new' })).toEqual({ variant: 'warning', label: 'Processing…' });
    });
  });

  describe('pipeline ready — defers to study status', () => {
    it('returns neutral New for new episodes', () => {
      expect(getEpisodeBadge({ status: 'ready', studyStatus: 'new' })).toEqual({ variant: 'neutral', label: 'New' });
    });

    it('returns info Studying for studying episodes', () => {
      expect(getEpisodeBadge({ status: 'ready', studyStatus: 'studying' })).toEqual({ variant: 'info', label: 'Studying' });
    });

    it('returns success Learned for learned episodes', () => {
      expect(getEpisodeBadge({ status: 'ready', studyStatus: 'learned' })).toEqual({ variant: 'success', label: 'Learned' });
    });
  });
});
