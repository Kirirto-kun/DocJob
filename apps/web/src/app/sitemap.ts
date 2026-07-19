import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { getPublicNewsItems } from '@/lib/news';

// The production database is available only when the container is running,
// not while the Docker image is being built.
export const dynamic = 'force-dynamic';

/**
 * Serves /sitemap.xml. Lists only public, indexable URLs. Auth-gated routes and
 * individual cases are deliberately excluded. /news carries the date of the most
 * recent news item as lastModified so crawlers re-check it when content changes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let newsLastModified: Date | undefined;
  try {
    const items = await getPublicNewsItems();
    const newest = items[0]?.date;
    if (newest) {
      const parsed = new Date(newest);
      if (!Number.isNaN(parsed.getTime())) newsLastModified = parsed;
    }
  } catch (error) {
    console.error('sitemap: failed to load news items', error);
  }

  return [
    {
      url: `${SITE_URL}/landing`,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/news`,
      changeFrequency: 'daily',
      priority: 0.8,
      lastModified: newsLastModified,
    },
    {
      url: `${SITE_URL}/download`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/legal/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/legal/terms`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
