import type { ElevenLabsTranscript } from './types';
import fixtureData from '../../../fixtures/elevenlabs-transcript.json';

const SCRIBE_V2_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

/**
 * Transcribe audio using ElevenLabs Scribe v2.
 * Returns word-level timestamps for Japanese (or any language).
 *
 * Set USE_MOCKS=true to return the fixture instead of calling the API.
 */
export async function transcribe(
  audioBuffer: Buffer,
  mimeType: string = 'audio/mpeg'
): Promise<ElevenLabsTranscript> {
  if (process.env.USE_MOCKS === 'true') {
    return fixtureData as ElevenLabsTranscript;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const formData = new FormData();
  formData.append('model_id', 'scribe_v2');
  formData.append('language_code', 'ja');
  formData.append('timestamps_granularity', 'word');
  formData.append(
    'file',
    new Blob([audioBuffer as unknown as ArrayBuffer], { type: mimeType }),
    'audio.mp3'
  );

  const response = await fetch(SCRIBE_V2_URL, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data as ElevenLabsTranscript;
}
