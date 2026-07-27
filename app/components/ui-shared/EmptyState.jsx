import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FadeIn } from "./Motion";

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
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center animate-soft-scale-in",
        className
      )}
    >
      {Icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition-smooth hover:scale-105">
          <Icon className="size-5" aria-hidden />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button className="mt-5 transition-smooth" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </FadeIn>
  );
}
