export const dynamic = 'force-dynamic';

import { getRandomStudyingChunk } from '@/db/chunks';
import { apiOk, apiErr } from '@/lib/api-response';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const excludeParam = searchParams.get('exclude');
    const excludeChunkId = excludeParam !== null ? parseInt(excludeParam, 10) : undefined;
    const chunk = await getRandomStudyingChunk(excludeChunkId);
    return apiOk(chunk);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return apiErr(message, 500);
  }
}
