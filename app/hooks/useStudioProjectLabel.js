"use client";

import { useEffect, useState } from "react";
import {
  entryMatchesSelectValue,
  mergeClientAccountEntries,
} from "@/lib/clientAccountList";
import { studioGreetingName } from "@/lib/studioProjectLabel";

/** Resolve a sidebar project key to a greeting-safe brand/host label. */
export function useStudioProjectLabel(siteKey) {
  const [label, setLabel] = useState(() => studioGreetingName(siteKey));

  useEffect(() => {
    const key = String(siteKey || "").trim();
    if (!key) {
      setLabel("");
      return undefined;
    }
    let alive = true;
    fetch("/api/admin/site-integrations")
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((data) => {
        if (!alive) return;
        const sites = mergeClientAccountEntries(data.sites || []);
        const entry = sites.find((s) => entryMatchesSelectValue(s, key));
        const name = entry?.displayName || entry?.userName || "";
        setLabel(studioGreetingName(key, name));
      })
      .catch(() => {
        if (alive) setLabel(studioGreetingName(key));
      });
    return () => {
      alive = false;
    };
  }, [siteKey]);

  return label;
}
