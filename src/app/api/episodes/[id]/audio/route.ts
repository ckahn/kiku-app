import { NextResponse } from 'next/server';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [episode] = await db.select({ audioUrl: episodes.audioUrl }).from(episodes).where(eq(episodes.id, Number(id)));
  if (!episode) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const blobRes = await fetch(episode.audioUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!blobRes.ok) return NextResponse.json({ error: 'Failed to fetch audio' }, { status: blobRes.status });

  return new NextResponse(blobRes.body, {
    headers: {
      'Content-Type': blobRes.headers.get('Content-Type') ?? 'audio/mpeg',
      'Content-Length': blobRes.headers.get('Content-Length') ?? '',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
