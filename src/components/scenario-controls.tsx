'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { handleFileUpload } from '@/app/actions';
import {
  Loader2,
  Upload,
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
  const { currentUser, updateUser } = useUserStore();
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations('nav');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const result = await handleFileUpload(formData);
    setIsUploading(false);

    if (result.success) {
      toast({
        title: t('scenario.uploadSuccessTitle'),
        description: t('scenario.uploadSuccessDescription', { name: file.name }),
      });
      const recordHeader = `--- UPLOADED BY PATIENT (${new Date().toLocaleDateString()}) ---\n`;
      const newRecords = recordHeader + result.data.recordContent;
      updateUser({
        ...currentUser,
        medicalRecords:
          (currentUser.medicalRecords ? currentUser.medicalRecords + '\n\n' : '') + newRecords,
      });
    } else {
      toast({
        variant: 'destructive',
        title: t('scenario.uploadErrorTitle'),
        description: result.error,
      });
    }
  };

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

      {currentUser.role === 'patient' && (
        <>
          <Separator className="my-2 bg-sidebar-border/50" />
          <div className={navWrapperClass}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".txt,.md,.pdf"
            />
            <Button
              variant="outline"
              className="w-full border-accent text-accent hover:bg-accent/10 hover:text-accent-foreground"
              onClick={handleFileSelect}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="mr-2 animate-spin" /> : <Upload className="mr-2" />}
              <span className="group-data-[collapsible=icon]:hidden">{t('patient.uploadReport')}</span>
            </Button>
          </div>
          {currentUser.medicalRecords && (
            <div className="p-2 group-data-[collapsible=icon]:hidden">
              <p className="text-xs text-muted-foreground truncate">{t('patient.recordsSaved')}</p>
            </div>
          )}
        </>
      )}

      <div className="mt-auto p-3 group-data-[collapsible=icon]:hidden">
        <BannerAd slot={1} />
      </div>
    </div>
  );
}
