import { describe, expect, it } from 'vitest';
import { isPermanentReplayFailure, toReplayRequest } from '../outboxReplay';
import type { OutboxEntry } from '../types';

describe('toReplayRequest', () => {
  it('derives the segment-status PATCH request', () => {
    const entry: OutboxEntry = {
      id: 'segment-status:101',
      kind: 'segment-status',
      targetId: 101,
      status: 'learned',
      clientTimestamp: 1000,
    };

    expect(toReplayRequest(entry)).toEqual({
      url: '/api/segments/101/study',
      body: { studyStatus: 'learned' },
    });
  });

  it('derives the episode-status PATCH request', () => {
    const entry: OutboxEntry = {
      id: 'episode-status:5',
      kind: 'episode-status',
      targetId: 5,
      status: 'studying',
      clientTimestamp: 2000,
    };

    expect(toReplayRequest(entry)).toEqual({
      url: '/api/episodes/5/study',
      body: { studyStatus: 'studying' },
    });
  });
});

describe('isPermanentReplayFailure', () => {
  it.each([
    [399, false],
    [400, true],
    [404, true],
    [408, false],
    [429, false],
    [499, true],
    [500, false],
    [503, false],
  ])('status %i -> permanent=%s', (status, expected) => {
    expect(isPermanentReplayFailure(status)).toBe(expected);
  });
});
