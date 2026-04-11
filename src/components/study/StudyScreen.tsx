'use client';

import Link from 'next/link';
import type { Chunk } from '@/db/schema';

interface StudyScreenProps {
  readonly chunk: Pick<
    Chunk,
    'id' | 'chunkIndex' | 'textRaw' | 'textFurigana' | 'furiganaStatus' | 'furiganaWarning' | 'startMs' | 'endMs'
  >;
  readonly audioUrl: string;
  readonly studyGuideUrl: string;
  readonly backHref: string;
}

export default function StudyScreen({
  chunk,
  audioUrl,
  studyGuideUrl,
  backHref,
}: StudyScreenProps) {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink transition-colors"
        >
          ← Back to transcript
        </Link>
      </div>

      <header className="space-y-1">
        <p className="text-sm text-muted">Chunk {chunk.chunkIndex + 1}</p>
        <h1 className="text-2xl font-bold text-ink">Study</h1>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-ink font-jp leading-loose">{chunk.textRaw}</p>
        <div className="mt-3 text-xs text-muted">
          <p>Audio: {audioUrl}</p>
          <p>Study guide: {studyGuideUrl}</p>
        </div>
      </section>
    </div>
  );
}
