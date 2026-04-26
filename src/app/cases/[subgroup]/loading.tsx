import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="h-full overflow-hidden p-4 md:p-6 lg:p-8">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-6 h-8 w-80" />
      <Skeleton className="mb-6 h-10 w-64" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </main>
  );
}
