import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="h-full overflow-hidden p-4 md:p-6 lg:p-8">
      <Skeleton className="mb-2 h-8 w-72" />
      <Skeleton className="mb-8 h-4 w-96" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full" />
        ))}
      </div>
    </main>
  );
}
