// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveTranscriptRestoreState,
  consumeTranscriptRestoreState,
  saveEpisodeFocusState,
  loadEpisodeFocusState,
} from '../player/studyNavigation';

const KEY = 'kiku:study-transcript-restore';
const EPISODE_HREF = '/podcasts/slow-japanese/episodes/7';

beforeEach(() => {
  localStorage.clear();
});

describe('saveTranscriptRestoreState + consumeTranscriptRestoreState', () => {
  it('round-trips the saved state when the episodeHref matches', () => {
    saveTranscriptRestoreState({ episodeHref: EPISODE_HREF, chunkId: 42 });
    const result = consumeTranscriptRestoreState(EPISODE_HREF);
    expect(result).toEqual({ episodeHref: EPISODE_HREF, chunkId: 42 });
  });

  it('returns null and removes the key when episodeHref does not match', () => {
    saveTranscriptRestoreState({ episodeHref: EPISODE_HREF, chunkId: 42 });
    const result = consumeTranscriptRestoreState('/podcasts/other/episodes/1');
    expect(result).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('returns null and removes the key when the stored JSON is malformed', () => {
    localStorage.setItem(KEY, 'not valid json{{{');
    const result = consumeTranscriptRestoreState(EPISODE_HREF);
    expect(result).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('returns null when chunkId is a string instead of a number', () => {
    localStorage.setItem(KEY, JSON.stringify({ episodeHref: EPISODE_HREF, chunkId: '42' }));
    const result = consumeTranscriptRestoreState(EPISODE_HREF);
    expect(result).toBeNull();
  });

  it('returns null when nothing was saved', () => {
    const result = consumeTranscriptRestoreState(EPISODE_HREF);
    expect(result).toBeNull();
  });

  it('returns null on the second consume — key is removed after the first call', () => {
    saveTranscriptRestoreState({ episodeHref: EPISODE_HREF, chunkId: 42 });
    consumeTranscriptRestoreState(EPISODE_HREF);
    const second = consumeTranscriptRestoreState(EPISODE_HREF);
    expect(second).toBeNull();
  });
});

describe('saveEpisodeFocusState + loadEpisodeFocusState', () => {
  it('round-trips the saved state when the episodeHref matches', () => {
    saveEpisodeFocusState({ episodeHref: EPISODE_HREF, chunkId: 7 });
    const result = loadEpisodeFocusState(EPISODE_HREF);
    expect(result).toEqual({ episodeHref: EPISODE_HREF, chunkId: 7 });
  });

  it('returns null (but keeps the key) when episodeHref does not match', () => {
    saveEpisodeFocusState({ episodeHref: EPISODE_HREF, chunkId: 7 });
    const result = loadEpisodeFocusState('/podcasts/other/episodes/1');
    expect(result).toBeNull();
    // Key is not removed — it belongs to a different episode
    expect(localStorage.getItem('kiku:episode-focus')).not.toBeNull();
  });

  it('returns null when nothing was saved', () => {
    expect(loadEpisodeFocusState(EPISODE_HREF)).toBeNull();
  });

  it('returns the state on a second load — key is not consumed', () => {
    saveEpisodeFocusState({ episodeHref: EPISODE_HREF, chunkId: 7 });
    loadEpisodeFocusState(EPISODE_HREF);
    const second = loadEpisodeFocusState(EPISODE_HREF);
    expect(second).toEqual({ episodeHref: EPISODE_HREF, chunkId: 7 });
  });

  it('overwrites the previous value when saved again', () => {
    saveEpisodeFocusState({ episodeHref: EPISODE_HREF, chunkId: 3 });
    saveEpisodeFocusState({ episodeHref: EPISODE_HREF, chunkId: 9 });
    expect(loadEpisodeFocusState(EPISODE_HREF)).toEqual({ episodeHref: EPISODE_HREF, chunkId: 9 });
  });

  it('returns null when the stored JSON is malformed', () => {
    localStorage.setItem('kiku:episode-focus', 'not json{{{');
    expect(loadEpisodeFocusState(EPISODE_HREF)).toBeNull();
  });
});
