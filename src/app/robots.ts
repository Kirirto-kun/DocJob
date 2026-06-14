import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Serves /robots.txt. Public marketing/content pages are crawlable; everything
 * behind auth is disallowed. /login and /register are intentionally NOT listed
 * here — they carry a `noindex` meta tag instead, which requires the crawler to
 * be able to fetch them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/reviewer/',
          '/cases/',
          '/ai-search',
          '/new-case',
          '/select-subgroup',
          '/manage-patients',
          '/saved-cases',
          '/suggest-case',
          '/add-doctor',
          '/add-patient',
          '/profile',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
