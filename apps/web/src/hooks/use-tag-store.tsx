'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { trpc } from '@/lib/trpc/react';
import { useUserStore } from './use-user-store';

type TagStore = {
  tags: string[];
  addTag: (label: string) => Promise<void>;
  refreshTags: () => Promise<void>;
  isInitialized: boolean;
};

const TagContext = createContext<TagStore | null>(null);

/**
 * Tag pool store, migrated off the `getTags`/`addTag` Server Actions to
 * `trpc.tags.*` (SP-2 Task 4). Public API (`tags`, `addTag`, `refreshTags`,
 * `isInitialized`) is unchanged so `tag-picker.tsx` keeps working unmodified.
 */
export function TagProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isInitialized: userInit } = useUserStore();
  const utils = trpc.useUtils();

  const hasUser = Boolean(currentUser);
  const listQuery = trpc.tags.list.useQuery(undefined, {
    enabled: userInit && hasUser,
  });

  const tags = useMemo(() => (hasUser ? (listQuery.data ?? []) : []), [hasUser, listQuery.data]);
  const isLoaded = !userInit ? false : !hasUser || listQuery.isFetched || listQuery.isError;

  const refreshTags = useCallback(async () => {
    await listQuery.refetch();
  }, [listQuery.refetch]);

  const addMutation = trpc.tags.add.useMutation();

  const addTag = useCallback(
    async (label: string) => {
      await addMutation.mutateAsync(label);
      await utils.tags.list.invalidate();
    },
    [addMutation, utils],
  );

  return (
    <TagContext.Provider value={{ tags, addTag, refreshTags, isInitialized: isLoaded }}>
      {children}
    </TagContext.Provider>
  );
}

export function useTagStore() {
  const ctx = useContext(TagContext);
  if (!ctx) throw new Error('useTagStore must be used within a TagProvider');
  return ctx;
}
