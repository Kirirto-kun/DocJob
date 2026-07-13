'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

const navButtonClass =
  'w-full justify-start border-primary/40 text-primary/80 hover:bg-primary/10 hover:text-primary';
const navButtonPrimaryClass =
  'w-full justify-start bg-primary/15 border-primary text-primary font-semibold shadow-sm shadow-primary/20 hover:bg-primary/25 hover:text-primary';
const navWrapperClass =
  'p-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center';

export default function ScenarioControls(_props: ScenarioControlsProps) {
  const { currentUser } = useUserStore();
  const router = useRouter();
  const t = useTranslations('nav');

  if (!currentUser) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2">
        <UserSwitcher />
      </div>
      <Separator className="my-2 bg-sidebar-border/50" />

      {currentUser.role === 'doctor' && (
        <>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={cn(navButtonPrimaryClass)}
              onClick={() => router.push('/select-subgroup')}
            >
              <LayoutGrid className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('subgroupCatalog')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/saved-cases')}
            >
              <Star className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('savedCases')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/ai-search')}
            >
              <Search className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('aiSearch')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/suggest-case')}
            >
              <FilePlus2 className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('suggestCase')}</span>
            </Button>
          </div>
          <Separator className="my-2 bg-sidebar-border/50" />
        </>
      )}

      {currentUser.role === 'reviewer' && (
        <>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={cn(navButtonPrimaryClass)}
              onClick={() => router.push('/select-subgroup')}
            >
              <LayoutGrid className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('subgroupCatalog')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/saved-cases')}
            >
              <Star className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('savedCases')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/reviewer/my-reviews')}
            >
              <PenSquare className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('myReviews')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/ai-search')}
            >
              <Search className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('aiSearch')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/suggest-case')}
            >
              <FilePlus2 className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('suggestCase')}</span>
            </Button>
          </div>
          <Separator className="my-2 bg-sidebar-border/50" />
        </>
      )}

      {currentUser.role === 'admin' && (
        <>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={cn(navButtonPrimaryClass)}
              onClick={() => router.push('/new-case')}
            >
              <FilePlus2 className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('createCase')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/admin/cases')}
            >
              <Files className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('allCases')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/admin/pending')}
            >
              <UserCheck className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('pendingApprovals')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/select-subgroup')}
            >
              <LayoutGrid className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('subgroupCatalog')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/ai-search')}
            >
              <Search className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('aiSearch')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/admin/case-submissions')}
            >
              <Inbox className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('caseSubmissions')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/admin/banners')}
            >
              <Megaphone className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('bannerAds')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/admin/news')}
            >
              <Newspaper className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('manageNews')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/admin/announcements')}
            >
              <Bell className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('manageAnnouncements')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/admin/users')}
            >
              <Users className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('manageUsers')}</span>
            </Button>
          </div>
          <div className={navWrapperClass}>
            <Button
              variant="outline"
              className={navButtonClass}
              onClick={() => router.push('/add-doctor')}
            >
              <UserPlus className="mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">{t('addDoctor')}</span>
            </Button>
          </div>
          <Separator className="my-2 bg-sidebar-border/50" />
        </>
      )}

      <div className={navWrapperClass}>
        <Button variant="outline" className={navButtonClass} onClick={() => router.push('/profile')}>
          <UserRound className="mr-2" />
          <span className="group-data-[collapsible=icon]:hidden">{t('profile')}</span>
        </Button>
      </div>
      <div className={navWrapperClass}>
        <Button variant="outline" className={navButtonClass} onClick={() => router.push('/news')}>
          <Newspaper className="mr-2" />
          <span className="group-data-[collapsible=icon]:hidden">{t('news')}</span>
        </Button>
      </div>
      <div className={navWrapperClass}>
        <Button variant="outline" className={navButtonClass} onClick={() => router.push('/contacts')}>
          <Phone className="mr-2" />
          <span className="group-data-[collapsible=icon]:hidden">{t('contacts')}</span>
        </Button>
      </div>
      <div className={navWrapperClass}>
        <Button variant="outline" className={navButtonClass} onClick={() => router.push('/support')}>
          <LifeBuoy className="mr-2" />
          <span className="group-data-[collapsible=icon]:hidden">{t('support')}</span>
        </Button>
      </div>

      <div className="mt-auto p-3 group-data-[collapsible=icon]:hidden">
        <BannerAd slot={1} />
      </div>
    </div>
  );
}
