import { NextResponse } from 'next/server';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, Number(id)));
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(episode);
}
