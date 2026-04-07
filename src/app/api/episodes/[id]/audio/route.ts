import { NextResponse } from 'next/server';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getErrorMessage } from '@/lib/utils';
import { apiErr } from '@/lib/api-response';
import { getPrivateBlob } from '@/lib/blob';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [episode] = await db.select({ audioUrl: episodes.audioUrl }).from(episodes).where(eq(episodes.id, Number(id)));
    if (!episode) return apiErr('Not found', 404);

    // Forward the Range header so the blob storage can return a 206 Partial Content
    // response for seeking. Without this the browser always receives the full stream
    // from byte 0, causing audio seeks to restart from the beginning.
    const rangeHeader = request.headers.get('Range');
    const blob = await getPrivateBlob(
      episode.audioUrl,
      rangeHeader ? { Range: rangeHeader } : undefined,
    );
    if (!blob) return apiErr('Audio blob not found', 404);

    // Handle 304 Not Modified (conditional GET with matching ETag)
    if (blob.statusCode === 304) {
      return new NextResponse(null, { status: 304 });
    }

    const responseHeaders: Record<string, string> = {
      'Content-Type': blob.headers.get('content-type') ?? 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    };

    const contentLength = blob.headers.get('content-length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    // Forward Content-Range header for 206 Partial Content responses
    const contentRange = blob.headers.get('content-range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    // blob.statusCode is typed as 200 but will be 206 at runtime for range requests
    return new NextResponse(blob.stream, {
      status: blob.statusCode,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
