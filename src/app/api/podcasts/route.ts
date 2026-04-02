import { NextResponse } from 'next/server';
import { db } from '@/db';
import { podcasts } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  const rows = await db.select().from(podcasts).orderBy(desc(podcasts.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const { name, description } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const [podcast] = await db
    .insert(podcasts)
    .values({ name, description })
    .returning();
  return NextResponse.json(podcast, { status: 201 });
}
