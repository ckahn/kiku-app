import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ElevenLabsTranscript } from '../types';

describe('transcribe() — mock mode', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an object with the required transcript fields', async () => {
    const { transcribe } = await import('../elevenlabs');
    const result = await transcribe(Buffer.from('dummy'));
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('words');
    expect(result).toHaveProperty('language_code');
    expect(result).toHaveProperty('language_probability');
  });

  it('returns a words array with at least one entry', async () => {
    const { transcribe } = await import('../elevenlabs');
    const result: ElevenLabsTranscript = await transcribe(Buffer.from('dummy'));
    expect(result.words.length).toBeGreaterThan(0);
  });

  it('does not make any HTTP requests', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { transcribe } = await import('../elevenlabs');
    await transcribe(Buffer.from('dummy'));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('each word entry has text, start, end, type, speaker_id, logprob', async () => {
    const { transcribe } = await import('../elevenlabs');
    const result = await transcribe(Buffer.from('dummy'));
    for (const word of result.words) {
      expect(word).toHaveProperty('text');
      expect(word).toHaveProperty('start');
      expect(word).toHaveProperty('end');
      expect(word).toHaveProperty('type');
      expect(word).toHaveProperty('speaker_id');
      expect(word).toHaveProperty('logprob');
    }
  });
});

describe('transcribe() — non-mock mode', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('throws when ELEVENLABS_API_KEY is not set', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    const { transcribe } = await import('../elevenlabs');
    await expect(transcribe(Buffer.from('dummy'))).rejects.toThrow(
      'ELEVENLABS_API_KEY is not configured'
    );
  });

  it('calls the ElevenLabs API with the correct headers and returns parsed JSON', async () => {
    const fakeResponse = {
      language_code: 'ja',
      language_probability: 0.99,
      text: 'テスト',
      words: [{ text: 'テスト', start: 0, end: 0.5, type: 'word', speaker_id: 'speaker_0', logprob: -0.1 }],
    };

    vi.stubEnv('ELEVENLABS_API_KEY', 'test-api-key');
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(fakeResponse), { status: 200 })
    );

    const { transcribe } = await import('../elevenlabs');
    const result = await transcribe(Buffer.from('audio-data'));

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('speech-to-text');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('test-api-key');
    expect(result.text).toBe('テスト');
    expect(result.words).toHaveLength(1);
  });

  it('throws on a non-OK API response', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-api-key');
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 })
    );

    const { transcribe } = await import('../elevenlabs');
    await expect(transcribe(Buffer.from('dummy'))).rejects.toThrow('ElevenLabs API error 401');
  });
});
