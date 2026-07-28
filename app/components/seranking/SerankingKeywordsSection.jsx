"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Search, Sparkles } from "lucide-react";
import SerankingShell, { formatSerankingCompact, useSerankingStatus } from "./SerankingShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

function IntentBadges({ intents }) {
  const map = { I: "Info", C: "Commercial", T: "Transaction", L: "Local", N: "Nav" };
  if (!intents?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {intents.map((t) => (
        <Badge key={t} variant="secondary" className="text-[10px]">
          {map[t] || t}
        </Badge>
      ))}
    </div>
  );
}

export default function SerankingKeywordsSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const hasGlobalAccess = session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const { credits, status: metaStatus } = useSerankingStatus(selectedSite);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seeds, setSeeds] = useState([]);
  const [discoverKeyword, setDiscoverKeyword] = useState("");
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverResults, setDiscoverResults] = useState(null);
  const [discoverError, setDiscoverError] = useState("");

  const load = useCallback(async () => {
    const site = hasGlobalAccess ? selectedSite : session?.user?.siteLink;
    if (!site?.startsWith("http")) return;
    setLoading(true);
    setError("");
    const q = new URLSearchParams();
    if (hasGlobalAccess) q.set("url", site);
    try {
      const res = await fetch(`/api/seranking/keywords?${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Failed to load keywords.");
      else setSeeds(Array.isArray(data.seeds) ? data.seeds : []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [selectedSite, hasGlobalAccess, session?.user?.siteLink]);

  useEffect(() => {
    load();
  }, [load]);

  const runDiscover = async () => {
    const site = hasGlobalAccess ? selectedSite : session?.user?.siteLink;
    const kw = discoverKeyword.trim();
    if (!kw || !site?.startsWith("http")) return;
    setDiscoverLoading(true);
    setDiscoverError("");
    setDiscoverResults(null);
    try {
      const q = new URLSearchParams();
      if (hasGlobalAccess) q.set("url", site);
      const res = await fetch(`/api/seranking/keywords?${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, limit: 15 }),
      });
      const data = await res.json();
      if (!res.ok) setDiscoverError(data.error || "Discovery failed.");
      else setDiscoverResults(Array.isArray(data.data) ? data.data : data.data?.keywords || []);
    } catch {
      setDiscoverError("Network error.");
    } finally {
      setDiscoverLoading(false);
    }
  };

  const discoverCost = 15 * 10;

  return (
    <SerankingShell
      title="Keyword Data"
      description="Top GSC queries enriched with volume, difficulty, and intent (3 seeds/site/month). On-demand similar-keyword discovery uses manual credit reserve."
      selectedSite={selectedSite}
      loading={loading}
      error={error}
      credits={credits}
      configured={metaStatus?.configured !== false}
      fetchedAt={metaStatus?.snapshots?.keywords_seeds?.fetchedAt}
      expiresAt={metaStatus?.snapshots?.keywords_seeds?.expiresAt}
    >
      <div className="space-y-6">
        <Card className="shadow-sm border-violet-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-violet-600" />
              GSC seed keywords (cached)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {seeds.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {seeds.map((row, i) => (
                  <div key={i} className="rounded-xl border border-border/80 bg-muted/20 p-4">
                    <p className="font-semibold text-sm truncate">{row.keyword}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Vol: {formatSerankingCompact(row.volume)}</span>
                      <span>Diff: {row.difficulty ?? "—"}</span>
                      <span>CPC: ${Number(row.cpc || 0).toFixed(2)}</span>
                      <span>Comp: {row.competition != null ? Number(row.competition).toFixed(2) : "—"}</span>
                    </div>
                    <IntentBadges intents={row.intents} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                Seed metrics appear after the nightly job pulls your top 3 GSC queries (~30 credits/site).
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="size-4" />
              Discover similar keywords
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <p className="text-xs text-muted-foreground">
              Manual lookup — up to ~{discoverCost} credits per search (10 per result). Uses credit reserve.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={discoverKeyword}
                onChange={(e) => setDiscoverKeyword(e.target.value)}
                placeholder="Enter a seed keyword…"
                className="flex-1"
              />
              <Button
                type="button"
                onClick={runDiscover}
                disabled={discoverLoading || !discoverKeyword.trim() || (credits?.remaining ?? 0) < discoverCost}
              >
                {discoverLoading ? "Searching…" : `Search (~${discoverCost} cr)`}
              </Button>
            </div>
            {discoverError ? <p className="text-sm text-destructive">{discoverError}</p> : null}
            {discoverResults?.length ? (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/80">
                {discoverResults.slice(0, 15).map((r, i) => (
                  <li key={i} className="px-3 py-2.5 flex justify-between gap-3 text-sm">
                    <span className="font-medium truncate">{r.keyword}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums text-xs">
                      vol {formatSerankingCompact(r.volume)} · diff {r.difficulty ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </SerankingShell>
  );
}
