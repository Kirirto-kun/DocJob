'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, PenSquare, Star, Upload } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useUserStore, type UserRole } from '@/hooks/use-user-store';
import { trpc } from '@/lib/trpc/react';
import { authFetch } from '@/lib/auth-client';

export default function ProfilePage() {
  const { currentUser, isInitialized, updateUser } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('user.profile');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (isInitialized && !currentUser) {
      router.push('/login');
    }
  }, [isInitialized, currentUser, router]);

  const savedIdsQuery = trpc.saved.ids.useQuery(undefined, {
    enabled: isInitialized && !!currentUser,
  });
  const savedCount = savedIdsQuery.data?.length ?? 0;

  const isReviewer = isInitialized && !!currentUser && currentUser.role === 'reviewer';
  const myReviewsQuery = trpc.reviews.mine.useQuery(undefined, { enabled: isReviewer });
  const reviewCount = myReviewsQuery.data?.length ?? 0;

  if (!isInitialized || !currentUser) {
    return (
      <DashboardLayout
        sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}
      >
        <main className="flex h-screen w-full items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
      </DashboardLayout>
    );
  }

  const ROLE_KEYS: Record<UserRole, 'admin' | 'doctor' | 'reviewer'> = {
    admin: 'admin',
    doctor: 'doctor',
    reviewer: 'reviewer',
  };
  const roleLabel = t(`role.${ROLE_KEYS[currentUser.role]}`);
  const fallback = t('fieldFallback');

  const avatarSrc = currentUser.profilePhotoUrl ?? '';
  const fallbackChar = currentUser.name.trim().charAt(0).toUpperCase() || '?';

  const consentText = currentUser.consentAcceptedAt
    ? t('consentAccepted', {
        date: new Date(currentUser.consentAcceptedAt).toLocaleDateString(locale === 'kk' ? 'kk-KZ' : 'ru-RU'),
      })
    : t('consentNotAccepted');

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await authFetch('/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.status === 401) {
        toast({
          variant: 'destructive',
          title: t('toast.noRightsTitle'),
          description: t('toast.noRightsDescription'),
        });
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? t('toast.uploadFailed'));
      }

      const result = (await res.json()) as { url: string };
      await updateUser({ ...currentUser, profilePhotoUrl: result.url });
      toast({
        title: t('toast.successTitle'),
        description: t('toast.successDescription'),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('toast.errorUnknown');
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <DashboardLayout
      sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}
    >
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
            {t('title')}
          </h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="font-headline">{t('photoCardTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center text-center space-y-4">
              <Avatar className="h-32 w-32">
                {avatarSrc ? <AvatarImage src={avatarSrc} alt={currentUser.name} /> : null}
                <AvatarFallback className="text-3xl">{fallbackChar}</AvatarFallback>
              </Avatar>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleUploadClick}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {t('uploadPhoto')}
              </Button>

              <div className="w-full space-y-1">
                <p className="font-bold text-lg break-words">{currentUser.name}</p>
                <p className="text-sm text-muted-foreground break-words">
                  {currentUser.email}
                </p>
              </div>

              <Badge variant="secondary">{roleLabel}</Badge>
            </CardContent>
          </Card>

          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-headline">{t('personalData')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  <ProfileField label={t('field.fullName')} value={currentUser.fullName ?? currentUser.name} />
                  <ProfileField label={t('field.region')} value={currentUser.region ?? fallback} />
                  <ProfileField
                    label={t('field.age')}
                    value={currentUser.age != null ? String(currentUser.age) : fallback}
                  />
                  <ProfileField
                    label={t('field.specialty')}
                    value={currentUser.specialty || fallback}
                  />
                  <ProfileField label={t('field.phone')} value={currentUser.phoneNumber ?? fallback} />
                  <ProfileField
                    label={t('field.consent')}
                    value={consentText}
                  />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-headline">{t('stats.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatTile
                    icon={<Star className="h-8 w-8 text-amber-500" />}
                    label={tNav('savedCases')}
                    value={savedCount}
                  />
                  {currentUser.role === 'reviewer' && (
                    <StatTile
                      icon={<PenSquare className="h-8 w-8 text-primary" />}
                      label={tNav('myReviews')}
                      value={reviewCount}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground break-words">{value}</dd>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
      {icon}
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold">{value}</p>
      </div>
    </div>
  );
}
