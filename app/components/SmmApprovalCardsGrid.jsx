"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiRefreshCw, FiX, FiZoomIn, FiZoomOut } from "react-icons/fi";
import ApprovalMediaPreview from "./ApprovalMediaPreview";
import { isApprovalVideoPath } from "../../lib/approvalMedia";

function normalizeSiteUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const path = u.pathname.replace(/\/+$/, "") || "";
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return s.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  }
}

function formatCardWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Heading shown on cards: assignee edit wins when set. */
function assigneeApprovalTitle(a) {
  if (a.userEditedTitle != null) return String(a.userEditedTitle).trim() || String(a.title || "").trim() || "Approval";
  return String(a.title || "").trim() || "Approval";
}

/** Thumbnail inside black frame (approval card). */
function MediaThumbnail({ mediaPath, title, facebookPageId, instagramUserId }) {
  const isInstagramOnly = instagramUserId && !facebookPageId;
  const aspectClass = isInstagramOnly ? "aspect-square" : "aspect-video";

  return (
    <div className={`relative w-full overflow-hidden rounded-lg border-[3px] border-black bg-black ${aspectClass} pointer-events-none`}>
      <ApprovalMediaPreview
        src={mediaPath}
        alt={String(title || "Post or reel preview").trim() || "Preview"}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {mediaPath && isApprovalVideoPath(mediaPath) ? (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Video
        </span>
      ) : null}
    </div>
  );
}

function ApprovalPreviewModal({ item, open, onClose }) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef(null);
  const videoRef = useRef(null);
  const path = item?.imagePath;

  useEffect(() => {
    if (open && item?.id) {
      setZoom(1);
    }
  }, [open, item?.id]);

  const isVideo = Boolean(path && isApprovalVideoPath(path));

  useEffect(() => {
    const onEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", onEscape);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onEscape);
        document.body.style.overflow = prevOverflow;
        if (videoRef.current) {
          videoRef.current.pause();
        }
      };
    }
  }, [open, onClose]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!open || isVideo || !el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const step = e.deltaY > 0 ? -0.12 : 0.12;
      setZoom((z) => {
        const n = Math.round((z + step) * 100) / 100;
        return Math.min(5, Math.max(1, n));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, isVideo]);

  const bumpZoom = useCallback((delta) => {
    setZoom((z) => {
      const n = Math.round((z + delta) * 100) / 100;
      return Math.min(5, Math.max(1, n));
    });
  }, []);

  if (!open || !item || !path) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-[min(1100px,95vw)] flex-col rounded-2xl bg-neutral-950 shadow-2xl border border-neutral-700"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close preview"
          className="absolute right-3 top-3 z-10 rounded-full bg-neutral-900/95 p-2 text-white hover:bg-neutral-800 border border-neutral-700"
          onClick={onClose}
        >
          <FiX className="h-5 w-5 shrink-0" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-5 pt-14">
          <h2 id="approval-modal-title" className="pr-12 text-lg font-semibold text-white line-clamp-2 leading-snug">
            {assigneeApprovalTitle(item)}
          </h2>
          {isVideo ? (
            <video
              ref={videoRef}
              src={path}
              controls
              playsInline
              preload="metadata"
              className="mx-auto max-h-[min(78vh,calc(100vh-200px))] w-full rounded-lg bg-black object-contain"
            />
          ) : (
            <>
              <div
                ref={scrollRef}
                className="flex max-h-[min(78vh,calc(100vh-200px))] min-h-[220px] w-full overflow-auto rounded-lg bg-neutral-900/80 border border-neutral-800 cursor-grab active:cursor-grabbing"
              >
                <div className="flex m-auto items-center justify-center p-6 min-h-min min-w-min">
                  <div
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "center center",
                      transition: "transform 0.1s ease-out",
                    }}
                    className="inline-block shadow-lg"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={path}
                      alt=""
                      draggable={false}
                      className="max-w-none max-h-none object-contain"
                      style={{ maxWidth: "min(88vw, 900px)", maxHeight: "min(70vh, 800px)" }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                <button
                  type="button"
                  disabled={zoom <= 1}
                  onClick={() => bumpZoom(-0.25)}
                  className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 font-medium text-white hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-40"
                >
                  <FiZoomOut className="h-4 w-4" aria-hidden />
                  Zoom out
                </button>
                <span className="min-w-[3.75rem] text-center tabular-nums text-neutral-400">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  disabled={zoom >= 5}
                  onClick={() => bumpZoom(0.25)}
                  className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 font-medium text-white hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-40"
                >
                  <FiZoomIn className="h-4 w-4" aria-hidden />
                  Zoom in
                </button>
                <span className="text-neutral-500 text-xs w-full text-center mt-1 sm:mt-0 sm:w-auto sm:ml-2">
                  Scroll wheel also zooms
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ownerIdForSite(users, siteUrl) {
  const target = normalizeSiteUrl(siteUrl);
  if (!target || !Array.isArray(users)) return null;
  for (const u of users) {
    const primary = normalizeSiteUrl(u.siteLink);
    if (primary && primary === target) return u.id;
    const links = u.accessibleSites || [];
    for (const entry of links) {
      const link = typeof entry === "string" ? entry : entry?.siteLink;
      if (link && normalizeSiteUrl(link) === target) return u.id;
    }
  }
  return null;
}

/**
 * Approval cards for SMM Statistics (hidden for SMM role — parent gates rendering).
 * Super admins: approvals for the user who owns / can access the selected site.
 */
export default function SmmApprovalCardsGrid({ isSuperAdmin = false, activeSite = "" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalItem, setModalItem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isSuperAdmin) {
        const [approvalsRes, usersRes, integrationsRes] = await Promise.all([
          fetch("/api/admin/approvals"),
          fetch("/api/admin/users"),
          fetch("/api/admin/site-integrations"),
        ]);
        const approvalsData = await approvalsRes.json();
        const usersData = await usersRes.json();
        const integrationsData = await integrationsRes.json();
        
        if (!approvalsRes.ok) throw new Error(approvalsData.error || "Failed to load approvals");
        if (!usersRes.ok) throw new Error(usersData.error || "Failed to load users");
        if (!integrationsRes.ok) throw new Error(integrationsData.error || "Failed to load integrations");

        const users = usersData.users || [];
        const all = approvalsData.approvals || [];
        const integrations = integrationsData.sites || [];

        if (!activeSite.trim()) {
          setItems([]);
          setError("");
          setLoading(false);
          return;
        }

        // Resolve activeSite and facebookPageId
        let resolvedSite = activeSite;
        let resolvedFbPageId = "";

        if (/^\d+$/.test(activeSite.trim())) {
          resolvedFbPageId = activeSite.trim();
          const match = integrations.find(
            (s) => s.facebookPageId === activeSite || s.instagramUserId === activeSite
          );
          if (match && match.siteLink) {
            resolvedSite = match.siteLink;
          }
        } else {
          const match = integrations.find(
            (s) => normalizeSiteUrl(s.siteLink) === normalizeSiteUrl(activeSite)
          );
          if (match && match.facebookPageId) {
            resolvedFbPageId = match.facebookPageId;
          }
        }

        const ownerId = ownerIdForSite(users, resolvedSite);
        const filtered = all
          .filter((a) => {
            if (a.hiddenFromAssignee) return false;
            
            // Match by siteLink or facebookPageId
            const matchSite = resolvedSite && a.siteLink && normalizeSiteUrl(a.siteLink) === normalizeSiteUrl(resolvedSite);
            const matchFb = resolvedFbPageId && a.facebookPageId && String(a.facebookPageId).trim() === String(resolvedFbPageId).trim();
            
            // Fallback match by ownerId
            const matchOwner = ownerId && (a.assigneeId === ownerId || a.assignee?.id === ownerId);
            
            return matchSite || matchFb || matchOwner;
          })
          .map((a) => ({
            id: a.id,
            title: a.title,
            userEditedTitle: a.userEditedTitle,
            imagePath: a.imagePath,
            status: a.status,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            respondedAt: a.respondedAt,
            facebookPageId: a.facebookPageId,
            instagramUserId: a.instagramUserId,
          }));
        setItems(filtered);
      } else {
        const res = await fetch("/api/approvals?smmDisplay=1");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setItems(data.approvals || []);
      }
    } catch (e) {
      setError(e.message || "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, activeSite]);

  useEffect(() => {
    load();
  }, [load]);

  const emptyHint = useMemo(() => {
    if (isSuperAdmin && !String(activeSite || "").trim()) {
      return "Select a site in the header to see that client’s approved items.";
    }
    return "No approval items assigned yet.";
  }, [isSuperAdmin, activeSite]);

  const noApprovedYetHint = useMemo(() => {
    if (isSuperAdmin && !String(activeSite || "").trim()) {
      return emptyHint;
    }
    return "Only approved items are shown here. Approve an item under Dashboard → Approvals, then refresh.";
  }, [isSuperAdmin, activeSite, emptyHint]);

  const approvedItems = useMemo(
    () =>
      items.filter(
        (a) =>
          String(a.status || "").toLowerCase() === "approved" && !a.hiddenFromAssignee
      ),
    [items]
  );

  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-500">Loading approvals…</div>
    );
  }

  return (
    <div>
      <ApprovalPreviewModal item={modalItem} open={Boolean(modalItem)} onClose={() => setModalItem(null)} />
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white hover:bg-gray-50"
        >
          <FiRefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>
      {error && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{error}</p>
      )}
      {!loading && items.length === 0 && !error ? (
        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">{emptyHint}</p>
      ) : null}
      {!loading && items.length > 0 && approvedItems.length === 0 && !error ? (
        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">
          {noApprovedYetHint}
        </p>
      ) : null}
      {approvedItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {approvedItems.map((a) => {
            const displayWhen = a.respondedAt || a.updatedAt || a.createdAt;
            const label =
              String(assigneeApprovalTitle(a) || "Approval preview").trim() || "Open approval preview";
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                aria-label={`${label}; open enlarged preview`}
                onClick={() => setModalItem(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setModalItem(a);
                  }
                }}
                className="flex cursor-pointer flex-col rounded-2xl bg-[#F9F9F9] p-5 font-sans shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#31c655] focus-visible:ring-offset-2 sm:p-6"
              >
                <header className="mb-5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-lg font-bold leading-snug text-black sm:text-xl">
                      {assigneeApprovalTitle(a)}
                    </h3>
                    <p className="mt-1 text-sm font-normal leading-normal text-[#666666]">
                      {formatCardWhen(displayWhen)}
                    </p>
                  </div>
                </header>
                <MediaThumbnail
                  mediaPath={a.imagePath}
                  title={assigneeApprovalTitle(a)}
                  facebookPageId={a.facebookPageId}
                  instagramUserId={a.instagramUserId}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
