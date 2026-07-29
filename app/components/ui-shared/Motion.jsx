"use client";

import { cn } from "@/lib/utils";

/**
 * Soft entrance animation. Respects prefers-reduced-motion via globals.css.
 */
export function FadeIn({ children, className, delay = 0, as: Tag = "div", ...props }) {
  return (
    <Tag
      className={cn("animate-soft-rise", className)}
      style={{ animationDelay: `${delay}ms` }}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** Staggered child — pair with StaggerGroup or manual index * 60 delay */
export function StaggerItem({ children, index = 0, className, as: Tag = "div", ...props }) {
  return (
    <Tag
      className={cn("animate-soft-rise", className)}
      style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** Re-mounts and animates when `sectionKey` changes (dashboard section nav) */
export function SectionTransition({ sectionKey, children, className }) {
  return (
    <div
      key={sectionKey}
      className={cn("animate-section-enter flex min-h-0 flex-1 flex-col", className)}
    >
      {children}
    </div>
  );
}

/** Subtle hover lift for cards and stat blocks */
export function HoverLift({ children, className, as: Tag = "div", ...props }) {
  return (
    <Tag className={cn("transition-smooth hover-lift", className)} {...props}>
      {children}
    </Tag>
  );
}
