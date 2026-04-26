import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { deletePrivateBlob } from '@/lib/blob';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, Number(id)));
  if (!episode) return apiErr('not found', 404);
  return apiOk(episode);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const episodeId = Number(id);

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode) return apiErr('not found', 404);

    try {
      await deletePrivateBlob(episode.audioUrl);
    } catch (error: unknown) {
      console.error(`[episodes.delete] failed to delete blob for episode ${episodeId}:`, error);
      return apiErr(getErrorMessage(error), 500);
    }

    await db.delete(episodes).where(eq(episodes.id, episodeId));
    return apiOk({ deleted: true });
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
