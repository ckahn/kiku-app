import { describe, expect, it } from 'vitest';
import { resolveOfflineRoute } from '../resolveOfflineRoute';

describe('resolveOfflineRoute', () => {
  it('resolves an episode page', () => {
    expect(resolveOfflineRoute('/podcasts/slow-japanese/episodes/3')).toEqual({
      kind: 'episode',
      slug: 'slow-japanese',
      episodeNumber: 3,
    });
  });

  it('resolves an episode page with a trailing slash', () => {
    expect(resolveOfflineRoute('/podcasts/slow-japanese/episodes/3/')).toEqual({
      kind: 'episode',
      slug: 'slow-japanese',
      episodeNumber: 3,
    });
  });

  it('resolves a study page', () => {
    expect(
      resolveOfflineRoute('/podcasts/slow-japanese/episodes/3/segments/0/study'),
    ).toEqual({
      kind: 'study',
      slug: 'slow-japanese',
      episodeNumber: 3,
      segmentIndex: 0,
    });
  });

  it('resolves a study page with a trailing slash', () => {
    expect(
      resolveOfflineRoute('/podcasts/slow-japanese/episodes/3/segments/12/study/'),
    ).toEqual({
      kind: 'study',
      slug: 'slow-japanese',
      episodeNumber: 3,
      segmentIndex: 12,
    });
  });

  it('treats a non-positive episode number as unsupported', () => {
    expect(resolveOfflineRoute('/podcasts/s/episodes/0')).toEqual({ kind: 'unsupported' });
  });

  it('treats a non-numeric episode number as unsupported', () => {
    expect(resolveOfflineRoute('/podcasts/s/episodes/abc')).toEqual({ kind: 'unsupported' });
  });

  it('treats a negative segment index as unsupported', () => {
    expect(resolveOfflineRoute('/podcasts/s/episodes/3/segments/-1/study')).toEqual({
      kind: 'unsupported',
    });
  });

  it('treats a non-integer segment index as unsupported', () => {
    expect(resolveOfflineRoute('/podcasts/s/episodes/3/segments/1.5/study')).toEqual({
      kind: 'unsupported',
    });
  });

  it('allows a zero segment index', () => {
    expect(resolveOfflineRoute('/podcasts/s/episodes/3/segments/0/study')).toEqual({
      kind: 'study',
      slug: 's',
      episodeNumber: 3,
      segmentIndex: 0,
    });
  });

  it('resolves the home page to the downloaded-episodes list', () => {
    expect(resolveOfflineRoute('/')).toEqual({ kind: 'home' });
  });

  it('treats the podcast detail page as unsupported', () => {
    expect(resolveOfflineRoute('/podcasts/slow-japanese')).toEqual({ kind: 'unsupported' });
  });

  it('treats a study path missing the study suffix as unsupported', () => {
    expect(resolveOfflineRoute('/podcasts/s/episodes/3/segments/0')).toEqual({
      kind: 'unsupported',
    });
  });

  it('treats a wrong literal segment as unsupported', () => {
    expect(resolveOfflineRoute('/shows/s/episodes/3')).toEqual({ kind: 'unsupported' });
  });

  it('treats an empty slug as unsupported', () => {
    expect(resolveOfflineRoute('/podcasts//episodes/3')).toEqual({ kind: 'unsupported' });
  });
});
