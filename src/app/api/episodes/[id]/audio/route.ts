import { NextResponse } from 'next/server';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getErrorMessage } from '@/lib/utils';
import { apiErr } from '@/lib/api-response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      return apiErr('BLOB_READ_WRITE_TOKEN is not configured', 500);
    }

    const { id } = await params;
    const [episode] = await db.select({ audioUrl: episodes.audioUrl }).from(episodes).where(eq(episodes.id, Number(id)));
    if (!episode) return apiErr('Not found', 404);

    const blobRes = await fetch(episode.audioUrl, {
      headers: { Authorization: `Bearer ${blobToken}` },
    });
    if (!blobRes.ok) return apiErr('Failed to fetch audio', blobRes.status);

    return new NextResponse(blobRes.body, {
      headers: {
        'Content-Type': blobRes.headers.get('Content-Type') ?? 'audio/mpeg',
        'Content-Length': blobRes.headers.get('Content-Length') ?? '',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
