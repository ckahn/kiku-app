import { experimental_transcribe as sdkTranscribe } from 'ai';
import { createElevenLabs } from '@ai-sdk/elevenlabs';
import type { ElevenLabsTranscript } from './types';
import fixtureData from '../../../fixtures/elevenlabs-transcript.json';

/**
 * Transcribe audio using ElevenLabs via the Vercel AI SDK.
 * Returns word-level timestamps for Japanese.
 *
 * Set USE_MOCKS=true to return the fixture instead of calling the API.
 *
 * Note: uses experimental_transcribe (ai@^4). When the function graduates
 * to stable, drop the alias import.
 */
export async function transcribe(
  audioBuffer: Buffer,
  _mimeType: string = 'audio/mpeg'
): Promise<ElevenLabsTranscript> {
  if (process.env.USE_MOCKS === 'true') {
    return fixtureData as ElevenLabsTranscript;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  // Use createElevenLabs to pass the key explicitly rather than relying on
  // the default provider's env lookup, which can be unreliable in some runtimes.
  const provider = createElevenLabs({ apiKey });

  const result = await sdkTranscribe({
    model: provider.transcription('scribe_v1'),
    audio: audioBuffer,
    providerOptions: {
      elevenlabs: {
        timestampsGranularity: 'word',
        languageCode: 'ja',
      },
    },
  });

  const metadata = result.providerMetadata?.elevenlabs as
    | { languageCode?: string; languageProbability?: number }
    | undefined;

  return {
    language_code: metadata?.languageCode ?? 'ja',
    language_probability: metadata?.languageProbability ?? 1.0,
    text: result.text,
    segments: result.segments.map((s) => ({
      text: s.text,
      startSecond: s.startSecond,
      endSecond: s.endSecond,
    })),
  };
}
