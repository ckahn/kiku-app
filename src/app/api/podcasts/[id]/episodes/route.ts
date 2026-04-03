import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db } from '@/db';
import { episodes } from '@/db/schema';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const podcastId = Number(id);

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const episodeNumberRaw = formData.get('episodeNumber') as string | null;
  const title = (formData.get('title') as string | null)?.trim() || null;

  if (!file || !episodeNumberRaw) {
    return NextResponse.json({ error: 'file and episodeNumber are required' }, { status: 400 });
  }
  const episodeNumber = Number(episodeNumberRaw);
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
    return NextResponse.json({ error: 'episodeNumber must be a positive integer' }, { status: 400 });
  }

  const blob = await put(file.name, file, {
    access: 'private',
    contentType: file.type || 'audio/mpeg',
    allowOverwrite: true,
  });

  const [episode] = await db
    .insert(episodes)
    .values({ podcastId, title: title ?? `Episode ${episodeNumber}`, audioUrl: blob.url, episodeNumber })
    .returning();

  return NextResponse.json(episode, { status: 201 });
}
