"use client";

import { useCallback, useEffect, useState } from "react";
import BlogSeedsPanel from "../seoAutopilot/BlogSeedsPanel";

export default function WriterSendsPanel({ siteLink, onRan, source = "autopilot" }) {
  const [sends, setSends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const isCompetitor = source === "competitor";

  const load = useCallback(async ({ soft = false } = {}) => {
    if (!siteLink) {
      setSends([]);
      setLoading(false);
      return;
    }
    if (!soft) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch(
        `/api/admin/blog-automation/writer-sends?siteLink=${encodeURIComponent(siteLink)}&source=${source}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load Autopilot seeds");
      setSends(data.sends || []);
      if (soft) setError("");
    } catch (err) {
      setError(err.message || "Failed to load Autopilot seeds");
    } finally {
      if (!soft) setLoading(false);
    }
  }, [siteLink, source]);

  useEffect(() => {
    load();
  }, [load]);

  const runSend = async (id) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/blog-automation/writer-sends/${id}/run`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      // Hand off to Run console immediately; refresh seeds in background without unmount flash.
      onRan?.(data.run);
      load({ soft: true });
    } catch (err) {
      setError(err.message || "Run failed");
    } finally {
      setBusyId("");
    }
  };

  const markCompleted = async (id) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/blog-automation/writer-sends/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load({ soft: true });
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setBusyId("");
    }
  };

  return (
    <BlogSeedsPanel
      siteLink={siteLink}
      mode="studio"
      label={isCompetitor ? "Competitor Analysis seeds" : "Autopilot seeds"}
      blurb={
        isCompetitor
          ? "Blog ideas generated from SERP Analysis — grounded in the live SERP, top rankers, and gaps for your target keyword. Pick a batch, review the brief, then run it through Studio agents 1–3."
          : "Incoming Blog Studio run payloads from SEO Autopilot’s Writer agent. Pick a timestamped batch, review the seed, then run it through Studio agents 1–3."
      }
      sends={sends}
      loading={loading}
      error={error}
      busyId={busyId}
      onReload={load}
      onRun={runSend}
      onMarkCompleted={markCompleted}
    />
  );
}
