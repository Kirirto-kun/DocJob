import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-background/40 px-4 py-2 md:px-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="hidden h-full min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-6 lg:p-6">
        <div className="space-y-4 overflow-hidden">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="space-y-3 overflow-hidden">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-[60%] w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <div className="flex h-full min-h-0 flex-1 flex-col gap-3 p-4 lg:hidden">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="flex-1 w-full" />
      </div>
    </main>
  );
}
