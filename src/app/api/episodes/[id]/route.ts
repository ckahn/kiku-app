import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { apiOk, apiErr } from '@/lib/api-response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, Number(id)));
  if (!episode) return apiErr('not found', 404);
  return apiOk(episode);
}
