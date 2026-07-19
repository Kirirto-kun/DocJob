'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import {
  UserPlus,
  UserRound,
  LifeBuoy,
  Newspaper,
  Phone,
  FilePlus2,
  LayoutGrid,
  Megaphone,
  UserCheck,
  Files,
  Star,
  Search,
  PenSquare,
  Inbox,
  Bell,
  Users,
  Loader2,
} from 'lucide-react';
import UserSwitcher from './user-switcher';
import { useUserStore } from '@/hooks/use-user-store';
import { Separator } from './ui/separator';
import { BannerAd } from './banner-ad';
import { cn } from '@/lib/utils';

type ScenarioControlsProps = {
  // Kept for backward compatibility with callers; now unused.
  onScenarioGenerated?: (scenario: unknown) => void;
};

type IconType = ComponentType<{ className?: string }>;

const navButtonClass =
  'w-full justify-start border-primary/40 text-primary/80 hover:bg-primary/10 hover:text-primary';
const navButtonPrimaryClass =
  'w-full justify-start bg-primary/15 border-primary text-primary font-semibold shadow-sm shadow-primary/20 hover:bg-primary/25 hover:text-primary';
const navWrapperClass =
  'p-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center';

export default function ScenarioControls(_props: ScenarioControlsProps) {
  const { currentUser } = useUserStore();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('nav');

  // Immediate click feedback: `useTransition`'s `isPending` stays true from the
  // moment a sidebar item is clicked until the destination route actually
  // commits (App Router navigations are React transitions — this also covers
  // the dev-only Turbopack "compiling…" wait). We track which href is pending
  // so the clicked button shows a spinner right where the user is looking, and
  // disable it so a "did it work?" second click can't fire a duplicate nav.
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear the pending marker once the navigation settles (transition ends).
  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  if (!currentUser) return null;

  const navigate = (href: string) => {
    if (href === pathname) return; // already here — no-op, no spinner
    setPendingHref(href);
    startTransition(() => router.push(href));
  };

  const navItem = (href: string, Icon: IconType, label: string, primary = false) => {
    const pending = pendingHref === href && isPending;
    return (
      <div className={navWrapperClass}>
        <Button
          variant="outline"
          className={cn(primary ? navButtonPrimaryClass : navButtonClass)}
          onClick={() => navigate(href)}
          disabled={pending}
          aria-busy={pending}
          data-pending={pending || undefined}
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2" />}
          <span className="group-data-[collapsible=icon]:hidden">{label}</span>
        </Button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2">
        <UserSwitcher />
      </div>
      <Separator className="my-2 bg-sidebar-border/50" />

      {currentUser.role === 'doctor' && (
        <>
          {navItem('/select-subgroup', LayoutGrid, t('subgroupCatalog'), true)}
          {navItem('/saved-cases', Star, t('savedCases'))}
          {navItem('/ai-search', Search, t('aiSearch'))}
          {navItem('/suggest-case', FilePlus2, t('suggestCase'))}
          <Separator className="my-2 bg-sidebar-border/50" />
        </>
      )}

      {currentUser.role === 'reviewer' && (
        <>
          {navItem('/select-subgroup', LayoutGrid, t('subgroupCatalog'), true)}
          {navItem('/saved-cases', Star, t('savedCases'))}
          {navItem('/reviewer/my-reviews', PenSquare, t('myReviews'))}
          {navItem('/ai-search', Search, t('aiSearch'))}
          {navItem('/suggest-case', FilePlus2, t('suggestCase'))}
          <Separator className="my-2 bg-sidebar-border/50" />
        </>
      )}

      {currentUser.role === 'admin' && (
        <>
          {navItem('/new-case', FilePlus2, t('createCase'), true)}
          {navItem('/admin/cases', Files, t('allCases'))}
          {navItem('/admin/pending', UserCheck, t('pendingApprovals'))}
          {navItem('/select-subgroup', LayoutGrid, t('subgroupCatalog'))}
          {navItem('/ai-search', Search, t('aiSearch'))}
          {navItem('/admin/case-submissions', Inbox, t('caseSubmissions'))}
          {navItem('/admin/banners', Megaphone, t('bannerAds'))}
          {navItem('/admin/news', Newspaper, t('manageNews'))}
          {navItem('/admin/announcements', Bell, t('manageAnnouncements'))}
          {navItem('/admin/users', Users, t('manageUsers'))}
          {navItem('/add-doctor', UserPlus, t('addDoctor'))}
          <Separator className="my-2 bg-sidebar-border/50" />
        </>
      )}

      {navItem('/profile', UserRound, t('profile'))}
      {navItem('/news', Newspaper, t('news'))}
      {navItem('/contacts', Phone, t('contacts'))}
      {navItem('/support', LifeBuoy, t('support'))}

      <div className="mt-auto p-3 group-data-[collapsible=icon]:hidden">
        <BannerAd slot={1} />
      </div>
    </div>
  );
}
