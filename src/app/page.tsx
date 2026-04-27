export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { episodes, podcasts } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import PodcastList from '@/components/PodcastList';
import StudyingEpisodesList from '@/components/StudyingEpisodesList';
import AddPodcastButton from '@/components/AddPodcastButton';
import { PageShell } from '@/components/layout';

export default async function HomePage() {
  const [podcastList, studyingEpisodes] = await Promise.all([
    db.select().from(podcasts).orderBy(desc(podcasts.createdAt)),
    db
      .select({
        id: episodes.id,
        title: episodes.title,
        episodeNumber: episodes.episodeNumber,
        podcastSlug: podcasts.slug,
        podcastName: podcasts.name,
        status: episodes.status,
        studyStatus: episodes.studyStatus,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(episodes.studyStatus, 'studying'))
      .orderBy(desc(episodes.updatedAt)),
  ]);
  return (
    <PageShell>
      <div className="mb-8 flex items-start gap-4">
        {/* Cherry blossom branch */}
        <svg
          viewBox="0 0 80 88"
          xmlns="http://www.w3.org/2000/svg"
          className="w-12 h-auto shrink-0 mt-0.5"
          aria-hidden="true"
        >
          {/* Main branch */}
          <path d="M10,88 Q22,65 36,46 Q44,34 54,20" fill="none" stroke="#8B5E3C" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Side branch */}
          <path d="M36,46 Q52,50 64,40" fill="none" stroke="#8B5E3C" strokeWidth="1.8" strokeLinecap="round"/>
          {/* Short twig at top */}
          <path d="M46,30 Q50,24 54,20" fill="none" stroke="#8B5E3C" strokeWidth="1.2" strokeLinecap="round"/>

          {/* Bud on main branch */}
          <ellipse cx="36" cy="43" rx="3" ry="5" fill="#F4A0B0" transform="rotate(-20, 36, 43)"/>

          {/* Flower 1 — top of main branch */}
          <g transform="translate(54 20)">
            <ellipse cx="0" cy="-10" rx="5.5" ry="8" transform="rotate(0)"   fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <ellipse cx="0" cy="-10" rx="5.5" ry="8" transform="rotate(72)"  fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <ellipse cx="0" cy="-10" rx="5.5" ry="8" transform="rotate(144)" fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <ellipse cx="0" cy="-10" rx="5.5" ry="8" transform="rotate(216)" fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <ellipse cx="0" cy="-10" rx="5.5" ry="8" transform="rotate(288)" fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <circle cx="0" cy="0" r="4.5" fill="#FFF8F0"/>
            <circle cx="0"   cy="-4.5" r="1"   fill="#E8A020"/>
            <circle cx="3.8" cy="-2.5" r="1"   fill="#E8A020"/>
            <circle cx="2.4" cy="2"    r="1"   fill="#E8A020"/>
            <circle cx="-2.4" cy="2"   r="1"   fill="#E8A020"/>
            <circle cx="-3.8" cy="-2.5" r="1"  fill="#E8A020"/>
          </g>

          {/* Flower 2 — side branch */}
          <g transform="translate(64 40)">
            <ellipse cx="0" cy="-9" rx="5" ry="7" transform="rotate(15)"  fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <ellipse cx="0" cy="-9" rx="5" ry="7" transform="rotate(87)"  fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <ellipse cx="0" cy="-9" rx="5" ry="7" transform="rotate(159)" fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <ellipse cx="0" cy="-9" rx="5" ry="7" transform="rotate(231)" fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <ellipse cx="0" cy="-9" rx="5" ry="7" transform="rotate(303)" fill="#F8D0D8" stroke="#E090A8" strokeWidth="0.4"/>
            <circle cx="0" cy="0" r="4" fill="#FFF8F0"/>
            <circle cx="0"    cy="-4" r="0.9"  fill="#E8A020"/>
            <circle cx="3.4"  cy="-2" r="0.9"  fill="#E8A020"/>
            <circle cx="2"    cy="1.8" r="0.9" fill="#E8A020"/>
            <circle cx="-2"   cy="1.8" r="0.9" fill="#E8A020"/>
            <circle cx="-3.4" cy="-2" r="0.9"  fill="#E8A020"/>
          </g>

          {/* Drifting petal */}
          <ellipse cx="20" cy="28" rx="3" ry="4.5" fill="#F8D0D8" opacity="0.65" transform="rotate(-35, 20, 28)"/>
        </svg>
        <div>
          <h1 className="text-xl font-semibold text-ink mb-1">Your podcasts</h1>
          <p className="text-sm text-muted">Add a Japanese podcast to start studying.</p>
        </div>
      </div>
      {studyingEpisodes.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">Currently studying</h2>
          <StudyingEpisodesList episodes={studyingEpisodes} />
        </div>
      )}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Library</h2>
          <AddPodcastButton />
        </div>
        <PodcastList podcasts={podcastList} />
      </div>
    </PageShell>
  );
}
