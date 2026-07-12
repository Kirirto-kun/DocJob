'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getTags, addTag as addTagAction } from '@/app/actions';
import { useUserStore } from './use-user-store';

type TagStore = {
  tags: string[];
  addTag: (label: string) => Promise<void>;
  refreshTags: () => Promise<void>;
  isInitialized: boolean;
};

const TagContext = createContext<TagStore | null>(null);

export function TagProvider({ children }: { children: React.ReactNode }) {
  const [tags, setTags] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { currentUser, isInitialized: userInit } = useUserStore();

  const refreshTags = useCallback(async () => {
    const res = await getTags();
    if (res.success) setTags(res.data);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (userInit && currentUser) {
      void refreshTags();
    } else if (userInit && !currentUser) {
      setTags([]);
      setIsLoaded(true);
    }
  }, [userInit, currentUser, refreshTags]);

  const addTag = useCallback(
    async (label: string) => {
      const res = await addTagAction(label);
      if (!res.success) throw new Error(res.error);
      await refreshTags();
    },
    [refreshTags]
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
