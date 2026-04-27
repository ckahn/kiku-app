import { describe, expect, it } from 'vitest';
import { toSlug } from '../slug';

describe('toSlug', () => {
  it('lowercases words and joins them with hyphens', () => {
    expect(toSlug('News In Slow Japanese')).toBe('news-in-slow-japanese');
  });

  it('collapses punctuation and repeated separators into one hyphen', () => {
    expect(toSlug('  Learn 日本語! Episode #12 -- Basics  ')).toBe(
      'learn-episode-12-basics'
    );
  });

  it('trims separators from the beginning and end', () => {
    expect(toSlug('---My Show---')).toBe('my-show');
  });

  it('returns an empty string when no ASCII letters or numbers are present', () => {
    expect(toSlug('日本語')).toBe('');
  });
});
