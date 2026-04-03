import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { podcasts } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getErrorMessage } from '@/lib/utils';

function toSlug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const createPodcastSchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
});

export async function GET() {
  try {
    const rows = await db.select().from(podcasts).orderBy(desc(podcasts.createdAt));
    return NextResponse.json(rows);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = createPodcastSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }
    const { name, description } = result.data;
    const slug = toSlug(name);
    const [existing] = await db.select().from(podcasts).where(eq(podcasts.slug, slug));
    if (existing) {
      return NextResponse.json(
        { error: `The name "${name}" is too similar to existing podcast "${existing.name}". Please choose a different name.` },
        { status: 409 }
      );
    }
    const [podcast] = await db.insert(podcasts).values({ name, slug, description }).returning();
    return NextResponse.json(podcast, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
