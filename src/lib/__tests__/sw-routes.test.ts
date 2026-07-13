import { describe, expect, it } from 'vitest';
import { isAudioRoute, isStudyGuideRoute } from '../sw-routes';

describe('isAudioRoute', () => {
  it('matches the episode audio route', () => {
    expect(isAudioRoute('/api/episodes/42/audio')).toBe(true);
  });

  it('does not match sub-paths or unrelated routes', () => {
    expect(isAudioRoute('/api/episodes/42/audio/extra')).toBe(false);
    expect(isAudioRoute('/api/episodes/42')).toBe(false);
    expect(isAudioRoute('/api/segments/42/audio')).toBe(false);
  });
});

describe('isStudyGuideRoute', () => {
  it('matches the segment study-guide route', () => {
    expect(isStudyGuideRoute('/api/segments/7/study-guide')).toBe(true);
  });

  it('does not match the regenerate sub-route', () => {
    expect(isStudyGuideRoute('/api/segments/7/study-guide/regenerate')).toBe(false);
  });

  it('does not match unrelated routes', () => {
    expect(isStudyGuideRoute('/api/segments/7/study')).toBe(false);
  });
});
