import { cn } from "@/lib/utils";

/** A single neon arc sweeping a graphite ring. Used for every section load. */
export function LoadingSpinner({ label = "Loading…", className }) {
  return (
    <div
      className={cn("flex h-48 flex-col items-center justify-center gap-4", className)}
      role="status"
      aria-live="polite"
    >
      <div className="relative size-10" aria-hidden>
        <div className="absolute inset-0 rounded-full border-2 border-[var(--cw-hairline)]" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cw-neon)]"
          style={{ animation: "spin-smooth 0.75s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}
        />
        <div className="absolute inset-1.5 rounded-full bg-[color-mix(in_srgb,var(--cw-neon)_10%,transparent)]" />
      </div>
      <p className="animate-pulse text-xs font-medium text-[var(--cw-ink-muted)]">{label}</p>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Skeleton tiles that match StatTile's shape, so nothing jumps on load. */
export function StatCardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="shimmer-overlay cw-lit rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-5"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="h-2.5 w-20 rounded-full bg-[var(--cw-raised)]" />
          <div className="mt-4 h-8 w-24 rounded-lg bg-[var(--cw-raised)]" />
          <div className="mt-3 h-2.5 w-32 rounded-full bg-[var(--cw-raised)]" />
        </div>
      ))}
    </div>
  );
}
