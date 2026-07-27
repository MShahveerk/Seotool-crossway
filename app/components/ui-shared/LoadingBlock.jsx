import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingSpinner({ label = "Loading…", className }) {
  return (
    <div
      className={cn("flex h-48 flex-col items-center justify-center gap-4", className)}
      role="status"
      aria-live="polite"
    >
      <div className="relative size-10" aria-hidden>
        <div className="absolute inset-0 rounded-full border-2 border-emerald-100" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-600"
          style={{ animation: "spin-smooth 0.75s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}
        />
        <div className="absolute inset-1.5 rounded-full bg-emerald-50/80" />
      </div>
      <p className="text-xs font-medium text-muted-foreground animate-pulse">{label}</p>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function StatCardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="shimmer-overlay rounded-2xl border border-border bg-card p-5"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-4 h-10 w-24" />
          <Skeleton className="mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
