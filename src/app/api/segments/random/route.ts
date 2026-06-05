export const dynamic = 'force-dynamic';

import { getRandomStudyingSegment } from '@/db/segments';
import { apiOk, apiErr } from '@/lib/api-response';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const excludeParam = searchParams.get('exclude');
    const excludeSegmentId = excludeParam !== null ? parseInt(excludeParam, 10) : undefined;
    const segment = await getRandomStudyingSegment(excludeSegmentId);
    return apiOk(segment);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return apiErr(message, 500);
  }
}
