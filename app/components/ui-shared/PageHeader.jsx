import { cn } from "@/lib/utils";
import { FadeIn } from "./Motion";

export default function PageHeader({
  title,
  description,
  actions,
  className,
  eyebrow,
}) {
  return (
    <FadeIn className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <FadeIn delay={60} className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </FadeIn>
      ) : null}
    </FadeIn>
  );
}
