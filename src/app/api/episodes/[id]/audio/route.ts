import { NextResponse } from 'next/server';
import { BlobNotFoundError, head } from '@vercel/blob';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getErrorMessage } from '@/lib/utils';
import { apiErr } from '@/lib/api-response';

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  return token;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [episode] = await db
      .select({ audioUrl: episodes.audioUrl })
      .from(episodes)
      .where(eq(episodes.id, Number(id)));
    if (!episode) return apiErr('Not found', 404);

    // Use head() to get the signed download URL without downloading content.
    // Then fetch directly so we get the real HTTP status (200 or 206) rather
    // than the SDK's normalised statusCode which is always 200.
    let blobMeta;
    try {
      blobMeta = await head(episode.audioUrl, { token: getBlobToken() });
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        return apiErr('Audio blob not found', 404);
      }

      throw error;
    }
    if (!blobMeta.downloadUrl) {
      return apiErr('Audio blob not found', 404);
    }

    // Forward Range header so blob storage returns 206 Partial Content for seeks
    const rangeHeader = request.headers.get('Range');
    const fetchHeaders: HeadersInit = {
      authorization: `Bearer ${getBlobToken()}`,
    };
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    const upstream = await fetch(blobMeta.downloadUrl, { headers: fetchHeaders });

    const responseHeaders: Record<string, string> = {
      'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': upstream.ok ? 'private, max-age=3600' : 'no-store',
    };

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    // Forward Content-Range on partial responses so the browser knows which
    // segment of the file these bytes correspond to
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    return new NextResponse(upstream.body, {
      status: upstream.status, // real status: 200 full or 206 partial
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
