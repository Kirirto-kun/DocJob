import type { Metadata } from 'next';

// The login page is a client component and cannot export metadata itself, so the
// segment layout carries it. Auth pages have no SEO value → noindex (but follow,
// so link equity still flows to public pages they link to).
export const metadata: Metadata = {
  title: 'Вход — DocJob',
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
