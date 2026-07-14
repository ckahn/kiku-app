import { describe, expect, it } from 'vitest';
import { audioDownloadPercent, downloadProgressLabel } from '../progress';
import type { DownloadRecord } from '../types';

function record(overrides: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    episodeId: 1,
    status: 'downloading',
    step: 'guides',
    guidesCompleted: 2,
    guidesTotal: 7,
    audioBytes: 0,
    audioTotalBytes: null,
    title: 'Episode 1',
    podcastSlug: 'my-podcast',
    episodeNumber: 1,
    updatedAt: Date.now(),
    ...overrides,
  };
}

const LABEL_OPTIONS = {
  guidesPrefix: 'Study guides',
  audioIndeterminateLabel: 'Downloading audio…',
};

describe('audioDownloadPercent', () => {
  it('returns the rounded percentage of a known total', () => {
    expect(audioDownloadPercent(record({ audioBytes: 250, audioTotalBytes: 1000 }))).toBe(25);
  });

  it('caps at 100 even if bytes overshoot the total', () => {
    expect(audioDownloadPercent(record({ audioBytes: 1500, audioTotalBytes: 1000 }))).toBe(100);
  });

  it('returns null when the total is unknown', () => {
    expect(audioDownloadPercent(record({ audioBytes: 250, audioTotalBytes: null }))).toBeNull();
  });

  it('returns null when the total is zero', () => {
    expect(audioDownloadPercent(record({ audioBytes: 0, audioTotalBytes: 0 }))).toBeNull();
  });
});

describe('downloadProgressLabel', () => {
  it('formats guide progress with the given prefix', () => {
    expect(downloadProgressLabel(record(), LABEL_OPTIONS)).toBe('Study guides 2/7');
  });

  it('formats audio progress as a percentage', () => {
    expect(
      downloadProgressLabel(
        record({ step: 'audio', audioBytes: 250, audioTotalBytes: 1000 }),
        LABEL_OPTIONS
      )
    ).toBe('Audio 25%');
  });

  it('falls back to the indeterminate label without a total', () => {
    expect(
      downloadProgressLabel(record({ step: 'audio', audioBytes: 250 }), LABEL_OPTIONS)
    ).toBe('Downloading audio…');
  });
});
