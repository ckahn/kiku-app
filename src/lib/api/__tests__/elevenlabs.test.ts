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
    expect(result).toHaveProperty('segments');
    expect(result).toHaveProperty('language_code');
    expect(result).toHaveProperty('language_probability');
  });

  it('returns a segments array with at least one entry', async () => {
    const { transcribe } = await import('../elevenlabs');
    const result: ElevenLabsTranscript = await transcribe(Buffer.from('dummy'));
    expect(result.segments.length).toBeGreaterThan(0);
  });

  it('does not make any HTTP requests', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { transcribe } = await import('../elevenlabs');
    await transcribe(Buffer.from('dummy'));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('each segment entry has text, startSecond, endSecond', async () => {
    const { transcribe } = await import('../elevenlabs');
    const result = await transcribe(Buffer.from('dummy'));
    for (const segment of result.segments) {
      expect(segment).toHaveProperty('text');
      expect(segment).toHaveProperty('startSecond');
      expect(segment).toHaveProperty('endSecond');
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
      segments: [{ text: 'テスト', startSecond: 0, endSecond: 0.5 }],
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
    expect(result.segments).toHaveLength(1);
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
