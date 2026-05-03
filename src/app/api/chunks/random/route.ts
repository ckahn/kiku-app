export const dynamic = 'force-dynamic';

import { getRandomStudyingChunk } from '@/db/chunks';
import { apiOk, apiErr } from '@/lib/api-response';

export async function GET() {
  try {
    const chunk = await getRandomStudyingChunk();
    return apiOk(chunk);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return apiErr(message, 500);
  }
}
