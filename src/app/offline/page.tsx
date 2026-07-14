'use client';

import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { PageShell } from '@/components/layout';
import EpisodePlayer from '@/components/player/EpisodePlayer';
import StudyScreen from '@/components/study/StudyScreen';
import { resolveOfflineRoute } from '@/lib/offline/resolveOfflineRoute';
import { findEpisodeBySlugAndNumber, getEpisodeSnapshot } from '@/lib/offline/store';
import {
  buildEpisodePlayerProps,
  buildStudyScreenProps,
  type OfflineEpisodePlayerProps,
  type OfflineStudyScreenProps,
} from '@/lib/offline/offlineEpisode';

// The offline app-shell (M3). The service worker serves this precached,
// `force-static`, self-sufficient document for offline navigations (see the
// `offline-support` skill / D1). It reads the requested URL, resolves the
// episode from IndexedDB, and hydrates the same EpisodePlayer / StudyScreen
// the online RSC pages render. It must not import any server-only modules
// (`@/db`, etc.) — its HTML + build-hashed chunks are precached together and
// refreshed each deploy, which is what keeps it deploy-consistent.
export const dynamic = 'force-static';

type ShellContent =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'episode';
      readonly title: string;
      readonly episodeNumber: number;
      readonly slug: string;
      readonly player: OfflineEpisodePlayerProps;
    }
  | { readonly kind: 'study'; readonly study: OfflineStudyScreenProps }
  | { readonly kind: 'not-downloaded' }
  | { readonly kind: 'unsupported' };

async function loadOfflineContent(pathname: string): Promise<ShellContent> {
  const route = resolveOfflineRoute(pathname);
  if (route.kind === 'unsupported') return { kind: 'unsupported' };

  const meta = await findEpisodeBySlugAndNumber(route.slug, route.episodeNumber);
  if (!meta) return { kind: 'not-downloaded' };

  // The `episodes` store is keyed by `episodeId`, which equals `episode.id`
  // (putEpisodeSnapshot sets `episodeId = episode.id`); the parsed meta only
  // carries `id`.
  const snapshot = await getEpisodeSnapshot(meta.id);
  if (!snapshot) return { kind: 'not-downloaded' };

  if (route.kind === 'episode') {
    return {
      kind: 'episode',
      title: snapshot.episode.title,
      episodeNumber: snapshot.episode.episodeNumber,
      slug: snapshot.episode.podcastSlug,
      player: buildEpisodePlayerProps(snapshot),
    };
  }

  const study = buildStudyScreenProps(snapshot, route.segmentIndex);
  if (!study) return { kind: 'not-downloaded' };
  return { kind: 'study', study };
}

function LoadingState() {
  return (
    <PageShell>
      <div className="flex items-center justify-center py-12" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    </PageShell>
  );
}

function OfflineEmptyState({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <PageShell backHref="/" backLabel="Home">
      <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{body}</p>
      </div>
    </PageShell>
  );
}

function renderContent(content: ShellContent, isOnline: boolean) {
  switch (content.kind) {
    case 'loading':
      return <LoadingState />;
    case 'episode':
      return (
        <PageShell backHref={`/podcasts/${content.slug}`} backLabel="Podcast">
          <div className="mb-6">
            <p className="mb-1 text-sm text-muted">Episode {content.episodeNumber}</p>
            <h1 className="text-2xl font-bold text-ink">{content.title}</h1>
          </div>
          <section aria-label="Transcript">
            <h2 className="mb-3 text-base font-semibold text-ink">Transcript</h2>
            <EpisodePlayer {...content.player} />
          </section>
        </PageShell>
      );
    case 'study':
      return (
        <PageShell>
          <StudyScreen {...content.study} />
        </PageShell>
      );
    case 'not-downloaded':
      // The shell is also directly reachable online (bookmark, typed URL), so
      // "You're offline" would be a lie there — pick copy by connectivity.
      return isOnline ? (
        <OfflineEmptyState
          title="Nothing to show here"
          body="This episode hasn't been downloaded for offline use. Head back to browse your podcasts."
        />
      ) : (
        <OfflineEmptyState
          title="You're offline"
          body="This episode hasn't been downloaded. Reconnect, or make it available offline while online, then try again."
        />
      );
    case 'unsupported':
      return isOnline ? (
        <OfflineEmptyState
          title="Nothing to show here"
          body="This page isn't part of the offline experience. Head back to browse your podcasts."
        />
      ) : (
        <OfflineEmptyState
          title="You're offline"
          body="This page isn't available offline. Reconnect to continue, or open a downloaded episode."
        />
      );
  }
}

export default function OfflineShell() {
  const [content, setContent] = useState<ShellContent>({ kind: 'loading' });
  const isOnline = useOnlineStatus();

  // Read the requested URL and load from IndexedDB in an effect so first
  // render (which also runs at build time with no `window`) stays the loading
  // state — no hydration mismatch.
  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      try {
        const next = await loadOfflineContent(window.location.pathname);
        if (!cancelled) setContent(next);
      } catch {
        // A matched route whose IndexedDB read failed (unusable store) is,
        // for the user, an episode that isn't available offline.
        if (!cancelled) setContent({ kind: 'not-downloaded' });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return renderContent(content, isOnline);
}
