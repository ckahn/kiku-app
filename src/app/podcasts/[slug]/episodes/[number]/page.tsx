import { notFound } from 'next/navigation';
import { db } from '@/db';
import { episodes, podcasts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { Badge } from '@/components/ui';
import { PageShell } from '@/components/layout';
import EpisodeStatusPoller from '@/components/EpisodeStatusPoller';
import EpisodePlayer from '@/components/player/EpisodePlayer';
import { getChunksByEpisodeId } from '@/db/chunks';
import LocalDateTime from '@/components/LocalDateTime';
import EpisodeActionMenu from '@/components/EpisodeActionMenu';

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

  const chunks = episode.status === 'ready'
    ? await getChunksByEpisodeId(episode.id)
    : [];

  return (
    <PageShell backHref={`/podcasts/${slug}`} backLabel={podcast.name}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          {episode.episodeNumber && (
            <p className="text-sm text-muted mb-1">Episode {episode.episodeNumber}</p>
          )}
          <h1 className="text-2xl font-bold text-ink">{episode.title}</h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant={STATUS_VARIANT[episode.status] ?? 'neutral'} className="mt-1 shrink-0">
            {episode.status}
          </Badge>
          <EpisodeActionMenu
            episodeId={episode.id}
            episodeTitle={episode.title}
            redirectTo={`/podcasts/${slug}`}
          />
        </div>
      </div>

      <dl className="space-y-3 text-sm mb-8">
        {episode.durationMs && (
          <div className="flex gap-6">
            <dt className="text-muted w-20 shrink-0">Duration</dt>
            <dd className="text-ink">{formatDuration(episode.durationMs)}</dd>
          </div>
        )}
        <div className="flex gap-6">
          <dt className="text-muted w-20 shrink-0">Added</dt>
          <dd className="text-ink">
            {episode.createdAt && <LocalDateTime iso={episode.createdAt.toISOString()} />}
          </dd>
        </div>
      </dl>

      <section aria-label="Transcript">
        <h2 className="text-base font-semibold text-ink mb-3">Transcript</h2>
        {episode.status === 'ready' ? (
          <EpisodePlayer
            chunks={chunks}
            audioUrl={`/api/episodes/${episode.id}/audio`}
            durationMs={episode.durationMs ?? 0}
            podcastSlug={slug}
            episodeNumber={episode.episodeNumber}
            episodeHref={`/podcasts/${slug}/episodes/${episode.episodeNumber}`}
          />
        ) : episode.status === 'error' ? (
          <div
            role="alert"
            className="rounded-lg border border-error-subtle bg-error-subtle px-4 py-3 text-sm text-error-on-subtle"
          >
            Processing failed. Please delete this episode and try again.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-4">
            <EpisodeStatusPoller
              episodeId={episode.id}
              initialStatus={episode.status}
            />
          </div>
        )}
      </section>
    </PageShell>
  );
}
