"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40;

async function parseSiteExplorerResponse(res) {
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error(
      res.status === 502 || res.status === 504 || res.status === 524
        ? "Gateway timed out. Retrying…"
        : "Could not read server response."
    );
  }
  if (!res.ok && res.status !== 202) {
    const hint = payload.hint ? ` ${payload.hint}` : "";
    throw new Error((payload.error || "Failed to load site explorer data") + hint);
  }
  return payload;
}

/**
 * @param {{ selectedSite?: string, exploreDomain?: string, gscSiteUrl?: string, view?: string, page?: number, pageSize?: number }} opts
 */
export function useSiteExplorerFetch({
  selectedSite = "",
  exploreDomain = "",
  gscSiteUrl = "",
  view = "overview",
  page = 1,
  pageSize = 50,
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const pollAttempts = useRef(0);
  const pollTimer = useRef(null);

  const targetDomain = exploreDomain.trim() || "";
  const hasTarget = Boolean(targetDomain || selectedSite);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const schedulePoll = useCallback(
    (runLoad) => {
      if (pollAttempts.current >= MAX_POLL_ATTEMPTS) {
        setRefreshing(false);
        return;
      }
      pollAttempts.current += 1;
      clearPoll();
      pollTimer.current = setTimeout(() => runLoad(false, { silent: true }), POLL_MS);
    },
    [clearPoll]
  );

  const load = useCallback(
    async (forceRefresh = false, { silent = false } = {}) => {
      if (!hasTarget) {
        setData(null);
        setLoading(false);
        setRefreshing(false);
        clearPoll();
        return;
      }

      if (!silent) {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);
      }

      setError("");
      try {
        const params = new URLSearchParams({ view, page: String(page), pageSize: String(pageSize) });
        if (targetDomain) params.set("domain", targetDomain);
        if (gscSiteUrl) params.set("url", gscSiteUrl);
        else if (selectedSite) params.set("url", selectedSite);
        if (forceRefresh) params.set("refresh", "1");

        const res = await fetch(`/api/site-explorer?${params.toString()}`, { cache: "no-store" });
        const payload = await parseSiteExplorerResponse(res);
        setData(payload);

        if (payload.running) {
          setRefreshing(true);
          if (forceRefresh) pollAttempts.current = 0;
          schedulePoll(load);
        } else {
          setRefreshing(false);
          pollAttempts.current = 0;
          clearPoll();
        }
      } catch (err) {
        if (!silent || pollAttempts.current === 0) {
          setError(err.message || "Failed to load site explorer data");
        }
        if (!silent) setData(null);
        setRefreshing(false);
        clearPoll();
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [hasTarget, targetDomain, gscSiteUrl, selectedSite, view, page, pageSize, clearPoll, schedulePoll]
  );

  useEffect(() => {
    pollAttempts.current = 0;
    clearPoll();
    load(false);
    return clearPoll;
  }, [load, clearPoll]);

  return { data, loading, refreshing, error, load, targetDomain };
}
