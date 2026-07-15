'use client';

import { UserProvider } from '@/hooks/use-user-store';
import { PatientProvider } from '@/hooks/use-patient-store';
import { TagProvider } from '@/hooks/use-tag-store';
import { AnnouncementModal } from '@/components/announcement-modal';
import { TRPCProvider } from '@/lib/trpc/provider';

/**
 * `TRPCProvider` (SP-2 Task 1, `@/lib/trpc/provider.tsx`) wraps outermost so
 * every existing provider — and every future tRPC-hook-based component, as
 * screens migrate off Server Actions in later SP-2 tasks — can use
 * `trpc.<domain>.<proc>.useQuery`/`useMutation`. It's additive infra only:
 * the existing provider order/behavior below (`UserProvider` →
 * `AnnouncementModal` → `PatientProvider` → `TagProvider`) is unchanged.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <TRPCProvider>
      <UserProvider>
        <AnnouncementModal />
        <PatientProvider>
          <TagProvider>{children}</TagProvider>
        </PatientProvider>
      </UserProvider>
    </TRPCProvider>
  );
}
