import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db } from '@/db';
import { episodes } from '@/db/schema';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podcastId } = await params;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const title = formData.get('title') as string | null;

  if (!file || !title?.trim()) {
    return NextResponse.json({ error: 'file and title are required' }, { status: 400 });
  }

  const blob = await put(file.name, file, {
    access: 'public',
    contentType: file.type || 'audio/mpeg',
  });

  const [episode] = await db
    .insert(episodes)
    .values({ podcastId, title, audioUrl: blob.url })
    .returning();

  return NextResponse.json(episode, { status: 201 });
}
