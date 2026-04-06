import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ElevenLabsTranscript } from '../types';

// Top-level mock so vi.mocked() works per-test without hoisting conflicts.
vi.mock('ai', () => ({
  experimental_transcribe: vi.fn(),
}));
vi.mock('@ai-sdk/elevenlabs', () => ({
  elevenlabs: { transcription: vi.fn().mockReturnValue('mocked-model') },
  createElevenLabs: vi.fn().mockReturnValue({
    transcription: vi.fn().mockReturnValue('mocked-model'),
  }),
}));
const mockGetPrivateBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/blob', () => ({
  getPrivateBlob: mockGetPrivateBlob,
}));

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

  it('does not call the AI SDK', async () => {
    const { experimental_transcribe } = await import('ai');
    const { transcribe } = await import('../elevenlabs');
    await transcribe(Buffer.from('dummy'));
    expect(experimental_transcribe).not.toHaveBeenCalled();
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('throws when ELEVENLABS_API_KEY is not set', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    const { transcribe } = await import('../elevenlabs');
    await expect(transcribe(Buffer.from('dummy'))).rejects.toThrow(
      'ELEVENLABS_API_KEY is not configured'
    );
  });

  it('maps AI SDK result to ElevenLabsTranscript shape', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-api-key');
    const { experimental_transcribe } = await import('ai');
    vi.mocked(experimental_transcribe).mockResolvedValueOnce({
      text: 'テスト',
      segments: [{ text: 'テスト', startSecond: 0, endSecond: 0.5 }],
      language: 'ja',
      durationInSeconds: 0.5,
      providerMetadata: {
        elevenlabs: { languageCode: 'ja', languageProbability: 0.99 },
      },
      warnings: [],
      responses: [],
    });

    const { transcribe } = await import('../elevenlabs');
    const result = await transcribe(Buffer.from('audio-data'));

    expect(result.text).toBe('テスト');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].startSecond).toBe(0);
    expect(result.language_code).toBe('ja');
    expect(result.language_probability).toBe(0.99);
  });

  it('downloads private blob URLs through the blob helper', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-api-key');
    const { experimental_transcribe } = await import('ai');
    vi.mocked(experimental_transcribe).mockImplementationOnce(async (input) => {
      const downloaded = await input.download?.({
        url: new URL('https://blob.example.com/audio.mp3'),
      });

      expect(downloaded?.data).toEqual(new Uint8Array([1, 2, 3]));
      expect(mockGetPrivateBlob).toHaveBeenCalledWith('https://blob.example.com/audio.mp3');

      return {
        text: 'テスト',
        segments: [{ text: 'テスト', startSecond: 0, endSecond: 0.5 }],
        language: 'ja',
        durationInSeconds: 0.5,
        providerMetadata: {
          elevenlabs: { languageCode: 'ja', languageProbability: 0.99 },
        },
        warnings: [],
        responses: [],
      };
    });

    mockGetPrivateBlob.mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.from([1, 2, 3]));
          controller.close();
        },
      }),
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      blob: {
        url: 'https://blob.example.com/audio.mp3',
        downloadUrl: 'https://blob.example.com/audio.mp3?download=1',
        pathname: 'audio.mp3',
        contentDisposition: 'inline',
        cacheControl: 'private',
        uploadedAt: new Date('2026-04-05T12:00:00.000Z'),
        etag: 'etag-1',
        contentType: 'audio/mpeg',
        size: 3,
      },
    });

    const { transcribe } = await import('../elevenlabs');
    await transcribe(new URL('https://blob.example.com/audio.mp3'));
  });

  it('throws when a private blob URL cannot be found', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-api-key');
    const { experimental_transcribe } = await import('ai');
    vi.mocked(experimental_transcribe).mockImplementationOnce(async (input) => {
      await input.download?.({
        url: new URL('https://blob.example.com/missing.mp3'),
      });

      return {
        text: 'ignored',
        segments: [],
        language: 'ja',
        durationInSeconds: 0,
        providerMetadata: {},
        warnings: [],
        responses: [],
      };
    });
    mockGetPrivateBlob.mockResolvedValueOnce(null);

    const { transcribe } = await import('../elevenlabs');
    await expect(transcribe(new URL('https://blob.example.com/missing.mp3'))).rejects.toThrow(
      'Audio blob not found'
    );
  });

  it('propagates AI SDK errors', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-api-key');
    const { experimental_transcribe } = await import('ai');
    vi.mocked(experimental_transcribe).mockRejectedValueOnce(new Error('API error 401'));

    const { transcribe } = await import('../elevenlabs');
    await expect(transcribe(Buffer.from('dummy'))).rejects.toThrow('API error 401');
  });
});
