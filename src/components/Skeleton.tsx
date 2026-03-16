// Skeleton loading card for video grid
export function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 sm:gap-3 animate-pulse">
      <div className="aspect-video rounded-lg sm:rounded-xl bg-zinc-800" />
      <div className="flex flex-col gap-1.5 px-0.5">
        <div className="h-3 sm:h-4 bg-zinc-800 rounded w-3/4" />
        <div className="h-2.5 sm:h-3 bg-zinc-800/60 rounded w-1/2" />
      </div>
    </div>
  );
}

export function VideoGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
