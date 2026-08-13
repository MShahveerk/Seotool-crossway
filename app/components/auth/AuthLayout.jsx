"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "../ui-shared/Motion";
import CrosswayLogo from "../ui-shared/CrosswayLogo";

export default function AuthLayout({ title, description, children, footer }) {
  return (
    <main className="cw-grid relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--cw-canvas)] px-4 py-10">
      {/* One cold pool of neon behind the card — the only colour on the page. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-80 max-w-3xl rounded-full bg-[var(--cw-neon)]/10 blur-3xl"
        style={{ animation: "glow-pulse 6s ease-in-out infinite" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-[var(--cw-info)]/5 blur-3xl"
        aria-hidden
      />
      <div className="relative w-full max-w-md space-y-6">
        <FadeIn className="flex flex-col items-center text-center">
          <Link
            href="/login"
            className="transition-smooth mb-4 inline-flex items-center gap-3 hover:scale-[1.03] active:scale-[0.98]"
          >
            <CrosswayLogo
              variant="dark"
              size={56}
              className="transition-smooth rounded-xl ring-1 ring-[var(--cw-hairline)]"
            />
          </Link>
          <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--cw-neon)] uppercase">
            Crossway Suite
          </p>
        </FadeIn>
        <FadeIn delay={80}>
          <Card className="animate-soft-scale-in cw-lit border-[var(--cw-hairline)] bg-[var(--cw-surface)] shadow-[var(--cw-shadow-lg)]">
            <CardHeader className="text-center">
              <CardTitle className="font-heading text-2xl font-semibold">{title}</CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
        </FadeIn>
        {footer ? (
          <FadeIn delay={140} className="text-center text-sm text-muted-foreground">
            {footer}
          </FadeIn>
        ) : null}
      </div>
    </main>
  );
}
