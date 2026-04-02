import { db } from '@/db';
import { podcasts } from '@/db/schema';
import { desc } from 'drizzle-orm';
import PodcastCreateForm from '@/components/PodcastCreateForm';
import PodcastList from '@/components/PodcastList';

export default async function HomePage() {
  const podcastList = await db.select().from(podcasts).orderBy(desc(podcasts.createdAt));
  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">聴く</h1>
      <PodcastCreateForm />
      <PodcastList podcasts={podcastList} />
    </main>
  );
}
