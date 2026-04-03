import { NextResponse } from 'next/server';
import { db } from '@/db';
import { podcasts, episodes } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, Number(id)));
  if (!podcast) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const episodeRows = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, Number(id)))
    .orderBy(desc(episodes.createdAt));

  return NextResponse.json({ ...podcast, episodes: episodeRows });
}
