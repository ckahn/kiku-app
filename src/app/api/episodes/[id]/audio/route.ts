import { NextResponse } from 'next/server';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getErrorMessage } from '@/lib/utils';
import { apiErr } from '@/lib/api-response';
import { getPrivateBlob } from '@/lib/blob';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [episode] = await db.select({ audioUrl: episodes.audioUrl }).from(episodes).where(eq(episodes.id, Number(id)));
    if (!episode) return apiErr('Not found', 404);

    const blob = await getPrivateBlob(episode.audioUrl);
    if (!blob) return apiErr('Audio blob not found', 404);

    return new NextResponse(blob.stream, {
      headers: {
        'Content-Type': blob.headers.get('content-type') ?? 'audio/mpeg',
        'Content-Length': blob.headers.get('content-length') ?? '',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
