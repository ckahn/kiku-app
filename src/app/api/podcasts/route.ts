import { NextResponse } from 'next/server';
import { db } from '@/db';
import { podcasts } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

function toSlug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET() {
  const rows = await db.select().from(podcasts).orderBy(desc(podcasts.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const { name, description } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
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
}
