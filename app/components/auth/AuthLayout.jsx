"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "../ui-shared/Motion";

export default function AuthLayout({ title, description, children, footer }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40 px-4 py-10 mesh-bg">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-80 max-w-4xl rounded-full bg-emerald-300/25 blur-3xl"
        style={{ animation: "glow-pulse 6s ease-in-out infinite" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute -bottom-20 -left-20 size-64 rounded-full bg-emerald-200/20 blur-3xl" aria-hidden />
      <div className="relative w-full max-w-md space-y-6">
        <FadeIn className="flex flex-col items-center text-center">
          <Link
            href="/login"
            className="mb-4 inline-flex items-center gap-3 transition-smooth hover:scale-[1.03] active:scale-[0.98]"
          >
            <img
              src="/crossway-logo.png"
              alt="Crossway"
              width={56}
              height={56}
              className="rounded-xl object-contain shadow-md ring-1 ring-border transition-smooth hover:shadow-lg"
            />
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Crossway Suite</p>
        </FadeIn>
        <FadeIn delay={80}>
          <Card className="animate-soft-scale-in border-border/80 shadow-xl shadow-emerald-900/5 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">{title}</CardTitle>
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
