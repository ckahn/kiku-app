import { NextResponse } from 'next/server';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { getErrorMessage } from '@/lib/utils';

export const maxDuration = 60;

const episodeFormSchema = z.object({
  file: z.instanceof(File, { message: 'file is required' }),
  episodeNumber: z.coerce.number().int().min(1, 'episodeNumber must be a positive integer'),
  title: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const podcastId = Number(id);

    const formData = await request.formData();
    const result = episodeFormSchema.safeParse({
      file: formData.get('file'),
      episodeNumber: formData.get('episodeNumber'),
      title: formData.get('title') ?? undefined,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }
    const { file, episodeNumber, title } = result.data;
    const trimmedTitle = title?.trim() || null;

    const blob = await put(file.name, file, {
      access: 'private',
      contentType: file.type || 'audio/mpeg',
      allowOverwrite: true,
    });

    const [episode] = await db
      .insert(episodes)
      .values({ podcastId, title: trimmedTitle ?? `Episode ${episodeNumber}`, audioUrl: blob.url, episodeNumber })
      .returning();

    return NextResponse.json(episode, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
