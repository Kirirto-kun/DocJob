'use client';

import { UserProvider } from '@/hooks/use-user-store';
import { PatientProvider } from '@/hooks/use-patient-store';
import { TagProvider } from '@/hooks/use-tag-store';
import { AnnouncementModal } from '@/components/announcement-modal';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AnnouncementModal />
      <PatientProvider>
        <TagProvider>{children}</TagProvider>
      </PatientProvider>
    </UserProvider>
  );
}
