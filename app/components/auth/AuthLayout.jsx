import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthLayout({ title, description, children, footer }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40 px-4 py-10">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-72 max-w-3xl rounded-full bg-emerald-200/30 blur-3xl"
        aria-hidden
      />
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <Link href="/login" className="mb-4 inline-flex items-center gap-3">
            <img
              src="/crossway-logo.png"
              alt="Crossway"
              width={56}
              height={56}
              className="rounded-xl object-contain shadow-sm ring-1 ring-border"
            />
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Crossway Suite</p>
        </div>
        <Card className="border-border/80 shadow-xl shadow-black/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  );
}
