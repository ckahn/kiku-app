/**
 * Capture a real ElevenLabs Scribe v2 transcript and save it as the fixture.
 *
 * Usage:
 *   npx tsx scripts/capture-elevenlabs-fixture.ts <path-to-audio.mp3>
 *
 * Requirements:
 *   - ELEVENLABS_API_KEY must be set in .env.local
 *   - Audio file must be a valid MP3 (or other format supported by Scribe v2)
 *
 * Output:
 *   Overwrites fixtures/elevenlabs-transcript.json with the real API response.
 *   After running, re-run `npm test` — fixtures.test.ts will report any
 *   inconsistencies with chunks.json / furigana.json that need manual updates.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, extname } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

const SCRIBE_V2_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const OUTPUT_PATH = resolve(process.cwd(), 'fixtures/elevenlabs-transcript.json');

const MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
};

async function main(): Promise<void> {
  const audioPath = process.argv[2];
  if (!audioPath) {
    console.error('Usage: npx tsx scripts/capture-elevenlabs-fixture.ts <path-to-audio.mp3>');
    process.exit(1);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('Error: ELEVENLABS_API_KEY is not set in .env.local');
    process.exit(1);
  }

  const resolvedPath = resolve(audioPath);
  const ext = extname(resolvedPath).toLowerCase();
  const mimeType = MIME_TYPES[ext] ?? 'audio/mpeg';

  console.log(`Reading audio from: ${resolvedPath}`);
  const audioBuffer = readFileSync(resolvedPath);
  console.log(`Audio size: ${(audioBuffer.length / 1024).toFixed(1)} KB`);

  const formData = new FormData();
  formData.append('model_id', 'scribe_v2');
  formData.append('language_code', 'ja');
  formData.append('timestamps_granularity', 'word');
  formData.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio.mp3');

  console.log('Calling ElevenLabs Scribe v2...');
  const response = await fetch(SCRIBE_V2_URL, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`ElevenLabs API error ${response.status}: ${body}`);
    process.exit(1);
  }

  const data = await response.json();

  writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8');

  console.log(`\nSaved to: ${OUTPUT_PATH}`);
  console.log(`Language: ${data.language_code} (probability: ${data.language_probability})`);
  console.log(`Words: ${data.words?.length ?? 0}`);
  console.log(`Text preview: ${data.text?.slice(0, 80)}...`);
  console.log('\nNext: run `npm test` to check fixture consistency.');
  console.log('If tests fail, update fixtures/chunks.json and fixtures/furigana.json to match the new word indices.');
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
