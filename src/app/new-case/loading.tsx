import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="h-full overflow-hidden p-4 md:p-6 lg:p-8 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-72 w-full" />
    </main>
  );
}
