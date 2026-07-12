import type { Metadata } from 'next';

// The register page is a client component and cannot export metadata itself, so
// the segment layout carries it. Auth pages have no SEO value → noindex (follow).
export const metadata: Metadata = {
  title: 'Регистрация — DocJob',
  robots: { index: false, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
