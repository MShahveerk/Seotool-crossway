import { Skeleton } from "@/components/ui/skeleton";

export function LoadingSpinner({ label = "Loading…" }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <div
        className="inline-block size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-emerald-600"
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function StatCardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-4 h-10 w-24" />
          <Skeleton className="mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
