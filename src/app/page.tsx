import { db } from '@/db';
import { podcasts } from '@/db/schema';
import { desc } from 'drizzle-orm';
import PodcastCreateForm from '@/components/PodcastCreateForm';
import PodcastList from '@/components/PodcastList';
import { PageShell } from '@/components/layout';

export default async function HomePage() {
  const podcastList = await db.select().from(podcasts).orderBy(desc(podcasts.createdAt));
  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-ink mb-1">Your podcasts</h1>
        <p className="text-sm text-muted">Add a Japanese podcast to start studying.</p>
      </div>
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">Add podcast</h2>
        <PodcastCreateForm />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">Library</h2>
        <PodcastList podcasts={podcastList} />
      </div>
    </PageShell>
  );
}
