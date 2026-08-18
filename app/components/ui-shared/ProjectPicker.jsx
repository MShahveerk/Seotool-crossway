"use client";

/**
 * ProjectPicker — fills a domain field from one of your projects.
 *
 * Toolkit tools are deliberately project-agnostic: you type a domain and they
 * research it. But most of the time the domain you want is a project you
 * already have, and retyping it is busywork. This is a convenience on the
 * input, not a scope control — picking a project writes text into the field and
 * nothing else changes.
 *
 * Meta-only projects are excluded; there's no domain to hand back.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, FolderOpen } from "lucide-react";
import { sessionHasGlobalSiteAccess } from "@/lib/clientPermissions";
import { isMetaPageId } from "@/lib/siteAccess";
import { mergeClientAccountEntries } from "@/lib/clientAccountList";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** One fetch per page load, shared by every picker on screen. */
let projectsPromise = null;

function loadProjects() {
  if (!projectsPromise) {
    projectsPromise = fetch("/api/admin/site-integrations")
      .then((res) => (res.ok ? res.json() : { sites: [] }))
      .then((data) => mergeClientAccountEntries(data.sites || []))
      .catch(() => []);
  }
  return projectsPromise;
}

/** Strip a site link down to the bare host these tools expect. */
export function toDomain(siteLink) {
  if (!siteLink) return "";
  const raw = String(siteLink).replace(/^sc-domain:/, "");
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

export default function ProjectPicker({ onSelect, label = "Use a project", className }) {
  const { data: session } = useSession();
  const [projects, setProjects] = useState([]);

  const hasGlobalSiteAccess = sessionHasGlobalSiteAccess(session);

  useEffect(() => {
    let alive = true;
    if (hasGlobalSiteAccess) {
      loadProjects().then((entries) => {
        if (alive) setProjects(entries);
      });
      return () => {
        alive = false;
      };
    }
    // Scoped users don't get the admin listing — build the list from the
    // sites already on their session.
    const own = [session?.user?.siteLink, ...(session?.user?.accessibleSites || [])]
      .filter(Boolean)
      .map((siteLink) => ({ siteLink, displayName: toDomain(siteLink) }));
    setProjects(own);
    return () => {
      alive = false;
    };
  }, [hasGlobalSiteAccess, session?.user?.siteLink, session?.user?.accessibleSites]);

  const options = [];
  const seen = new Set();
  for (const entry of projects) {
    const domain = toDomain(entry.siteLink);
    if (!domain || isMetaPageId(entry.siteLink) || seen.has(domain)) continue;
    seen.add(domain);
    options.push({
      domain,
      label: entry.displayName || entry.userName || domain,
    });
  }

  if (options.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1 text-[11px] font-semibold text-[var(--cw-ink-dim)] transition-smooth",
          "hover:border-[color-mix(in_srgb,var(--cw-neon)_35%,var(--cw-hairline))] hover:text-[var(--cw-ink)]",
          className
        )}
      >
        <FolderOpen className="size-3 text-[var(--cw-neon)]" />
        {label}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 w-56 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.domain}
            onClick={() => onSelect?.(option.domain)}
            className="text-xs"
          >
            <span className="truncate">{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
