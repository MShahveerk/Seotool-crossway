import { cn } from "@/lib/utils";
import Btn from "./Btn";
import { FadeIn } from "./Motion";

/**
 * EmptyState — nothing here yet, said calmly.
 *
 * Dashed hairline so it reads as a placeholder rather than a broken panel, and
 * the icon carries the only spot of neon.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}) {
  return (
    <FadeIn
      className={cn(
        "animate-soft-scale-in flex flex-col items-center justify-center rounded-2xl",
        "border border-dashed border-[var(--cw-hairline-strong)] bg-[var(--cw-surface)]/60",
        "px-6 py-14 text-center",
        className
      )}
    >
      {Icon ? (
        <div className="transition-smooth mb-4 flex size-12 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--cw-neon)_25%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_9%,transparent)] text-[var(--cw-neon)] hover:scale-105">
          <Icon className="size-5" aria-hidden />
        </div>
      ) : null}
      <h3 className="font-heading text-base font-semibold text-[var(--cw-ink)]">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--cw-ink-muted)]">
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <Btn variant="primary" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Btn>
      ) : null}
    </FadeIn>
  );
}
