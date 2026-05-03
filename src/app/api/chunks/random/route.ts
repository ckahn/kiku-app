export const dynamic = 'force-dynamic';

import { getRandomStudyingChunk } from '@/db/chunks';

export async function GET() {
  const chunk = await getRandomStudyingChunk();
  return Response.json({ data: chunk });
}
