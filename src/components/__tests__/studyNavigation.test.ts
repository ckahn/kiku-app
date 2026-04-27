// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveEpisodeFocusState,
  loadEpisodeFocusState,
} from '../player/studyNavigation';

const KEY = 'kiku:episode-focus';
const EPISODE_HREF = '/podcasts/slow-japanese/episodes/7';

beforeEach(() => {
  localStorage.clear();
});

describe('saveEpisodeFocusState + loadEpisodeFocusState', () => {
  it('round-trips the saved state when the episodeHref matches', () => {
    saveEpisodeFocusState({ episodeHref: EPISODE_HREF, chunkId: 42 });
    const result = loadEpisodeFocusState(EPISODE_HREF);
    expect(result).toEqual({ episodeHref: EPISODE_HREF, chunkId: 42 });
  });

  it('returns null and keeps the key when episodeHref does not match', () => {
    saveEpisodeFocusState({ episodeHref: EPISODE_HREF, chunkId: 42 });
    const result = loadEpisodeFocusState('/podcasts/other/episodes/1');
    expect(result).toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it('returns null when the stored JSON is malformed', () => {
    localStorage.setItem(KEY, 'not valid json{{{');
    const result = loadEpisodeFocusState(EPISODE_HREF);
    expect(result).toBeNull();
  });

  it('returns null when chunkId is a string instead of a number', () => {
    localStorage.setItem(KEY, JSON.stringify({ episodeHref: EPISODE_HREF, chunkId: '42' }));
    const result = loadEpisodeFocusState(EPISODE_HREF);
    expect(result).toBeNull();
  });

  it('returns null when nothing was saved', () => {
    const result = loadEpisodeFocusState(EPISODE_HREF);
    expect(result).toBeNull();
  });

  it('returns the state on a second load', () => {
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

});
