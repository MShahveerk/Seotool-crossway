import { cn } from "@/lib/utils";
import { FadeIn } from "./Motion";

/**
 * PageHeader — the standard way a section states what it is.
 *
 * A neon eyebrow, a display-face title, one line of explanation, actions on the
 * right. Every section using this reads as part of the same product.
 */
export default function PageHeader({
  title,
  description,
  actions,
  className,
  eyebrow,
  icon: Icon,
}) {
  return (
    <FadeIn
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon ? (
          <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] text-[var(--cw-neon)]">
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--cw-neon)] uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance text-[var(--cw-ink)] sm:text-[28px]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--cw-ink-muted)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <FadeIn delay={60} className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </FadeIn>
      ) : null}
    </FadeIn>
  );
}
