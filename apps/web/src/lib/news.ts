import { prisma } from '@docjob/db';

export type PublicNewsItem = {
  id: string;
  title: string;
  body: string;
  date: string;
};

export async function getPublicNewsItems(): Promise<PublicNewsItem[]> {
  const items = await prisma.newsItem.findMany({ orderBy: { date: 'desc' } });

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    date: item.date.toISOString(),
  }));
}
