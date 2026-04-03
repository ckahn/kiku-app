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
      <h1 className="text-2xl font-bold text-ink mb-6">KIKU</h1>
      <PodcastCreateForm />
      <PodcastList podcasts={podcastList} />
    </PageShell>
  );
}
