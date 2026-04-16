import { describe, it, expect } from 'vitest';
import transcript from '@fixtures/elevenlabs-transcript.json';
import chunks from '@fixtures/chunks.json';
import furigana from '@fixtures/furigana.json';
import studyGuide from '@fixtures/study-guide.json';

describe('elevenlabs-transcript.json', () => {
  it('has a non-empty text field', () => {
    expect(transcript.text.length).toBeGreaterThan(0);
  });

  it('has a non-empty segments array', () => {
    expect(transcript.segments.length).toBeGreaterThan(0);
  });

  it('has a high language probability', () => {
    expect(transcript.language_probability).toBeGreaterThanOrEqual(0.95);
  });

  it('has non-overlapping timestamps (each segment startSecond >= previous segment endSecond)', () => {
    for (let i = 1; i < transcript.segments.length; i++) {
      const prev = transcript.segments[i - 1];
      const curr = transcript.segments[i];
      expect(curr.startSecond).toBeGreaterThanOrEqual(prev.endSecond - 0.001); // tiny float tolerance
    }
  });

  it('has non-negative start times', () => {
    for (const segment of transcript.segments) {
      expect(segment.startSecond).toBeGreaterThanOrEqual(0);
    }
  });

  it('text equals concatenation of all segment texts', () => {
    const concatenated = transcript.segments.map((s) => s.text).join('');
    expect(concatenated).toBe(transcript.text);
  });
});

describe('chunks.json', () => {
  it('has at least one chunk', () => {
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('all word indices are within bounds of transcript.segments', () => {
    const maxIndex = transcript.segments.length - 1;
    for (const chunk of chunks) {
      expect(chunk.first_word_index).toBeGreaterThanOrEqual(0);
      expect(chunk.last_word_index).toBeLessThanOrEqual(maxIndex);
      expect(chunk.first_word_index).toBeLessThanOrEqual(chunk.last_word_index);
    }
  });

  it('chunk text equals concatenation of its segment range', () => {
    for (const chunk of chunks) {
      const segmentsInRange = transcript.segments.slice(
        chunk.first_word_index,
        chunk.last_word_index + 1
      );
      const concatenated = segmentsInRange.map((s) => s.text).join('');
      expect(concatenated).toBe(chunk.text);
    }
  });

  it('chunks cover non-overlapping, sequential word ranges', () => {
    const sorted = [...chunks].sort((a, b) => a.first_word_index - b.first_word_index);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      expect(curr.first_word_index).toBeGreaterThan(prev.last_word_index);
    }
  });
});

describe('furigana.json', () => {
  it('has the same length as chunks.json', () => {
    expect(furigana.length).toBe(chunks.length);
  });

  it('each entry text matches the corresponding chunk text', () => {
    for (let i = 0; i < furigana.length; i++) {
      expect(furigana[i].text).toBe(chunks[i].text);
    }
  });

  it('each entry carries the same word indices as the corresponding chunk', () => {
    for (let i = 0; i < furigana.length; i++) {
      expect(furigana[i].first_word_index).toBe(chunks[i].first_word_index);
      expect(furigana[i].last_word_index).toBe(chunks[i].last_word_index);
    }
  });

  it('each text_furigana contains at least one <ruby> tag', () => {
    for (const entry of furigana) {
      expect(entry.text_furigana).toContain('<ruby');
    }
  });

  it('text_furigana contains the plain text content', () => {
    // Remove <rt>...</rt> readings first (their text content is not part of the base text),
    // then strip remaining HTML tags — the result should equal the plain chunk text.
    for (const entry of furigana) {
      const stripped = entry.text_furigana
        .replace(/<rt>[^<]*<\/rt>/g, '')
        .replace(/<[^>]+>/g, '');
      expect(stripped).toBe(entry.text);
    }
  });
});

describe('study-guide.json', () => {
  it('has version 2', () => {
    expect(studyGuide.version).toBe(2);
  });

  it('has a curated vocabulary list with required fields', () => {
    expect(studyGuide.vocabulary.length).toBeGreaterThan(0);

    for (const item of studyGuide.vocabulary) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.japanese.length).toBeGreaterThan(0);
      expect(item.partOfSpeech).toBeDefined();
      expect(item.partOfSpeech!.length).toBeGreaterThan(0);
      expect(item.meaning.length).toBeGreaterThan(0);
    }
  });

  it('has flat structure items with required fields', () => {
    expect(studyGuide.structures.length).toBeGreaterThan(0);

    for (const structure of studyGuide.structures) {
      expect(structure.id.length).toBeGreaterThan(0);
      expect(structure.pattern.length).toBeGreaterThan(0);
      expect(structure.meaning.length).toBeGreaterThan(0);
    }
  });

  it('has ordered breakdown segments with cues', () => {
    expect(studyGuide.breakdown.length).toBeGreaterThan(0);

    for (const [index, segment] of studyGuide.breakdown.entries()) {
      expect(segment.id.length).toBeGreaterThan(0);
      expect(segment.japanese.length).toBeGreaterThan(0);
      expect(segment.cue.length).toBeGreaterThan(0);
      expect(segment.order).toBe(index);
    }
  });

  it('has a full English translation', () => {
    expect(studyGuide.translation.fullEnglish.length).toBeGreaterThan(0);
  });
});
