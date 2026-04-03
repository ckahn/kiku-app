import { notFound } from 'next/navigation';
import { db } from '@/db';
import { episodes, podcasts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { Badge } from '@/components/ui';
import { PageShell } from '@/components/layout';

type BadgeVariant = 'info' | 'warning' | 'success' | 'error' | 'neutral';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  uploaded:     'info',
  transcribing: 'warning',
  chunking:     'warning',
  ready:        'success',
  error:        'error',
};

function formatDuration(ms: number): string {
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.slug, slug));
  if (!podcast) notFound();

  const [episode] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.podcastId, podcast.id), eq(episodes.episodeNumber, Number(number))));
  if (!episode) notFound();

  return (
    <PageShell backHref={`/podcasts/${slug}`} backLabel={podcast.name}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          {episode.episodeNumber && (
            <p className="text-sm text-muted mb-1">Episode {episode.episodeNumber}</p>
          )}
          <h1 className="text-2xl font-bold text-ink">{episode.title}</h1>
        </div>
        <Badge variant={STATUS_VARIANT[episode.status] ?? 'neutral'} className="mt-1 shrink-0">
          {episode.status}
        </Badge>
      </div>

      {episode.status === 'error' && episode.errorMessage && (
        <div className="mb-6 rounded-lg border border-error-subtle bg-error-subtle px-4 py-3 text-sm text-error-on-subtle">
          {episode.errorMessage}
        </div>
      )}

      <dl className="space-y-3 text-sm mb-8">
        {episode.durationMs && (
          <div className="flex gap-6">
            <dt className="text-muted w-20 shrink-0">Duration</dt>
            <dd className="text-ink">{formatDuration(episode.durationMs)}</dd>
          </div>
        )}
        <div className="flex gap-6">
          <dt className="text-muted w-20 shrink-0">Audio</dt>
          <dd>
            <a
              href={`/api/episodes/${episode.id}/audio`}
              className="text-primary hover:text-primary-hover underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              Open audio
            </a>
          </dd>
        </div>
        <div className="flex gap-6">
          <dt className="text-muted w-20 shrink-0">Created</dt>
          <dd className="text-ink">{episode.createdAt?.toLocaleString()}</dd>
        </div>
      </dl>

      {/* TODO(M3): replace with real chunks */}
      <section aria-label="Transcript">
        <h2 className="text-base font-semibold text-ink mb-3">Transcript</h2>
        <div className="rounded-lg border border-border bg-surface p-4">
          {episode.status === 'ready' ? (
            <p className="text-sm text-muted">Chunks will appear here.</p>
          ) : (
            <>
              <p className="text-xs text-muted mb-4 pb-3 border-b border-border-subtle">
                Sample — transcript pending
              </p>
              {/* Static sample from fixtures to validate Japanese typography */}
              <div className="space-y-4 font-jp leading-loose">
                <p>おはようございます。<ruby>今日<rt>きょう</rt></ruby>も<ruby>朝<rt>あさ</rt></ruby><ruby>早<rt>はや</rt></ruby>く<ruby>起<rt>お</rt></ruby>きてしまいました。</p>
                <p>でも、コーヒーを<ruby>飲<rt>の</rt></ruby>みながら、ゆっくり<ruby>準備<rt>じゅんび</rt></ruby>するのが<ruby>好<rt>す</rt></ruby>きなんです。</p>
                <p><ruby>時間<rt>じかん</rt></ruby>があれば、もっと<ruby>勉強<rt>べんきょう</rt></ruby>したいと<ruby>思<rt>おも</rt></ruby>っています。</p>
              </div>
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}
