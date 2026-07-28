"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { FiFileText, FiRefreshCw, FiSave, FiSettings, FiTrash2, FiZap } from "react-icons/fi";
import { datetimeLocalToUtcIso, formatScheduleShort, timezoneShortLabel } from "../../lib/timezone";
import BlogRichTextEditor, { isRichTextEmpty } from "./BlogRichTextEditor";
import HumanizeTextButton from "./HumanizeTextButton";
import FileChooseField from "./ui-shared/FileChooseField";
import InboundApiDocsPanel from "./InboundApiDocsPanel";
import EmailInboundConfigFields from "./EmailInboundConfigFields";

const DEFAULT_CONFIG = {
  enabled: true,
  deliveryChain: ["webhook", "wordpress", "api", "email"],
  webhookUrl: "",
  webhookSecret: "",
  apiUrl: "",
  apiKey: "",
  wordpressUrl: "",
  wordpressUsername: "",
  wordpressAppPassword: "",
  emailRecipients: "",
  inboundSecret: "",
  wordpressPullEnabled: false,
  wordpressPullStatuses: ["draft", "future", "pending"],
  lastWordpressPullAt: null,
  emailInboundEnabled: false,
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPassword: "",
  imapFolder: "INBOX",
  lastEmailPullAt: null,
};

function FocusKeywordPlannerHint({ keyword }) {
  const [hint, setHint] = useState(null);

  useEffect(() => {
    const k = String(keyword || "").trim();
    if (k.length < 3) {
      setHint(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/keywords/validate?keyword=${encodeURIComponent(k)}&geo=us`);
        const data = await res.json();
        setHint(data);
      } catch {
        setHint(null);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [keyword]);

  if (!hint?.configured || !String(keyword || "").trim()) return null;
  if (hint.error) {
    return <p className="mt-1.5 text-xs text-amber-700">{hint.error}</p>;
  }
  if (!hint.metrics) {
    return hint.suggestion ? <p className="mt-1.5 text-xs text-amber-700">{hint.suggestion}</p> : null;
  }

  const m = hint.metrics;
  return (
    <p className="mt-1.5 text-xs text-gray-600">
      Planner (US):{" "}
      <span className="font-semibold text-gray-800">
        {m.avgMonthlySearches != null ? `${Number(m.avgMonthlySearches).toLocaleString()}/mo` : "—"}
      </span>
      {m.competition ? ` · ${m.competition} competition` : ""}
      {m.lowTopOfPageBid && m.highTopOfPageBid ? ` · bids ${m.lowTopOfPageBid}–${m.highTopOfPageBid}` : ""}
      {hint.suggestion ? <span className="block text-amber-700 mt-0.5">{hint.suggestion}</span> : null}
    </p>
  );
}

function WordpressDiagnosticsPanel({ diagnostics, title = "WordPress diagnostics" }) {
  if (!diagnostics) return null;

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50/80 p-4 space-y-3 text-xs text-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-gray-900">{title}</p>
        <button type="button" onClick={copyJson} className="px-2 py-1 rounded border border-gray-300 bg-white text-xs font-semibold">
          Copy JSON
        </button>
      </div>

      {Array.isArray(diagnostics.summary) && diagnostics.summary.length ? (
        <div>
          <p className="font-semibold uppercase tracking-wide text-gray-600 mb-1">Summary</p>
          <ul className="list-disc pl-5 space-y-1">
            {diagnostics.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {diagnostics.saveAudit ? (
        <div>
          <p className="font-semibold uppercase tracking-wide text-gray-600 mb-1">Last save</p>
          <pre className="overflow-x-auto rounded bg-white border border-gray-200 p-2 whitespace-pre-wrap">
            {JSON.stringify(diagnostics.saveAudit, null, 2)}
          </pre>
        </div>
      ) : null}

      {diagnostics.audit ? (
        <div>
          <p className="font-semibold uppercase tracking-wide text-gray-600 mb-1">Config audit (no full password)</p>
          <pre className="overflow-x-auto rounded bg-white border border-gray-200 p-2 whitespace-pre-wrap">
            {JSON.stringify(diagnostics.audit, null, 2)}
          </pre>
        </div>
      ) : null}

      {diagnostics.access ? (
        <div>
          <p className="font-semibold uppercase tracking-wide text-gray-600 mb-1">Access probes</p>
          <pre className="overflow-x-auto rounded bg-white border border-gray-200 p-2 whitespace-pre-wrap">
            {JSON.stringify(diagnostics.access, null, 2)}
          </pre>
        </div>
      ) : null}

      {Array.isArray(diagnostics.trace) && diagnostics.trace.length ? (
        <div>
          <p className="font-semibold uppercase tracking-wide text-gray-600 mb-1">HTTP requests</p>
          <pre className="overflow-x-auto rounded bg-white border border-gray-200 p-2 whitespace-pre-wrap max-h-96">
            {JSON.stringify(diagnostics.trace, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminBlogSection({ selectedSite = "" }) {
  const { data: session } = useSession();
  const canManageContent =
    session?.user?.role === "super_admin" || session?.user?.role === "smm";
  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    wpStatus: "draft",
    scheduledFor: "",
    categories: "",
    tags: "",
    featuredImageAlt: "",
    seoTitle: "",
    metaDescription: "",
    focusKeyword: "",
    approveOnAssignment: false,
  });
  const [featuredFile, setFeaturedFile] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [blogs, setBlogs] = useState([]);
  const [blogsLoading, setBlogsLoading] = useState(false);
  const [wpTesting, setWpTesting] = useState(false);
  const [wpPulling, setWpPulling] = useState(false);
  const [wpPostId, setWpPostId] = useState("");
  const [wpIncludeTrash, setWpIncludeTrash] = useState(false);
  const [wpDiagnostics, setWpDiagnostics] = useState(null);
  const [publishBusyId, setPublishBusyId] = useState("");
  const [logsForId, setLogsForId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [revisionsForId, setRevisionsForId] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [deleteBusyId, setDeleteBusyId] = useState("");
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailPulling, setEmailPulling] = useState(false);

  const softDeletedCount = blogs.filter((b) => b.status === "deleted").length;

  const loadConfig = useCallback(async () => {
    if (!selectedSite || !canManageContent) return;
    setConfigLoading(true);
    try {
      const q = new URLSearchParams({ siteLink: selectedSite });
      const res = await fetch(`/api/admin/blog-publish-config?${q}`);
      const data = await res.json();
      if (res.ok && data.config) setConfig({ ...DEFAULT_CONFIG, ...data.config });
    } catch {
      /* ignore */
    } finally {
      setConfigLoading(false);
    }
  }, [selectedSite, canManageContent]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const loadBlogs = useCallback(async () => {
    if (!selectedSite || !canManageContent) return;
    setBlogsLoading(true);
    try {
      const q = new URLSearchParams({ site: selectedSite });
      const res = await fetch(`/api/admin/blogs?${q}`);
      const data = await res.json();
      if (res.ok) setBlogs(data.blogs || []);
    } catch {
      /* ignore */
    } finally {
      setBlogsLoading(false);
    }
  }, [selectedSite, canManageContent]);

  useEffect(() => {
    loadBlogs();
  }, [loadBlogs]);

  const saveConfig = async () => {
    if (!selectedSite) {
      setError("Select a site first.");
      return;
    }
    setConfigLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/blog-publish-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, siteLink: selectedSite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings");
      setConfig({ ...DEFAULT_CONFIG, ...data.config });
      setWpDiagnostics(
        data.saveAudit
          ? {
              saveAudit: data.saveAudit,
              summary: [data.saveAudit.note, `Password length: ${data.saveAudit.password?.length || 0}`, `Preview: ${data.saveAudit.password?.preview || "n/a"}`],
            }
          : null
      );
      setMessage(
        data.saveAudit
          ? `Publish settings saved. Password stored: ${data.saveAudit.passwordStored ? "yes" : "no"} (${data.saveAudit.password?.length || 0} chars, preview ${data.saveAudit.password?.preview || "n/a"}).`
          : "Publish settings saved."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setConfigLoading(false);
    }
  };

  const testEmailInbound = async () => {
    if (!selectedSite) return;
    setEmailTesting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/email-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey: selectedSite, contentType: "blog", action: "test" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "IMAP test failed");
      setMessage(`IMAP OK — ${data.result?.messages ?? 0} messages, ${data.result?.unseen ?? 0} unseen.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setEmailTesting(false);
    }
  };

  const pullEmailInbound = async () => {
    if (!selectedSite) return;
    setEmailPulling(true);
    setError("");
    try {
      const res = await fetch("/api/admin/email-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey: selectedSite, contentType: "blog", action: "pull" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email pull failed");
      setMessage(data.message || "Email pull complete.");
      await loadConfig();
    } catch (err) {
      setError(err.message);
    } finally {
      setEmailPulling(false);
    }
  };

  const runWordpressDiagnostics = async () => {
    if (!selectedSite) {
      setError("Select a site first.");
      return;
    }
    setWpTesting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/wordpress/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteLink: selectedSite, ...config }),
      });
      const data = await res.json();
      setWpDiagnostics(data);
      if (!res.ok || !data.ok) throw new Error(data.error || "Diagnostics failed");
      setMessage(Array.isArray(data.summary) ? data.summary.join(" ") : "Diagnostics complete — see panel below.");
    } catch (err) {
      setError(err.message);
    } finally {
      setWpTesting(false);
    }
  };

  const testWordpress = async () => {
    if (!selectedSite) {
      setError("Select a site first.");
      return;
    }
    setWpTesting(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/wordpress/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteLink: selectedSite, ...config }),
      });
      const data = await res.json();
      setWpDiagnostics(data.diagnostics || null);
      if (!res.ok || !data.ok) throw new Error(data.error || "Connection test failed");
      const breakdown = data.statusCounts
        ? Object.entries(data.statusCounts)
            .filter(([, v]) => typeof v === "number")
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")
        : "";
      setMessage(
        [
          `WordPress connected as ${data.name || "user"} at ${data.wordpressUrl || config.wordpressUrl || "unknown URL"}.`,
          data.roles?.length ? `Role: ${data.roles.join(", ")}.` : null,
          breakdown ? `API post counts — ${breakdown} (${data.apiTotal ?? "?"} total).` : null,
          data.diagnosis || data.statusFilterNote || null,
          data.sampleDrafts?.length
            ? `Recent pullable posts: ${data.sampleDrafts.map((p) => `${p.title || `#${p.id}`}${p.status ? ` [${p.status}]` : ""}`).join("; ")}`
            : "No draft/future/pending posts returned by the API.",
        ]
          .filter(Boolean)
          .join(" ")
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setWpTesting(false);
    }
  };

  const pullWordpressDrafts = async ({ onlyScheduled = false, byPostId = false } = {}) => {
    if (!selectedSite) {
      setError("Select a site first.");
      return;
    }
    if (byPostId && !String(wpPostId || "").trim()) {
      setError("Enter a WordPress post ID first.");
      return;
    }
    setWpPulling(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/wordpress/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteLink: selectedSite,
          onlyScheduled,
          includeTrash: wpIncludeTrash,
          wordpressPostId: byPostId ? String(wpPostId).trim() : "",
        }),
      });
      const data = await res.json();
      setWpDiagnostics(data.diagnostics || null);
      if (!res.ok) throw new Error(data.error || "Pull failed");
      const counts = data.statusCounts
        ? Object.entries(data.statusCounts)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")
        : "";
      const scheduledHint =
        data.scheduledDraftCount > 0
          ? ` (${data.scheduledDraftCount} draft(s) have a future publish date)`
          : "";
      const summary = `Fetched ${data.fetched ?? data.total ?? 0} from WordPress: ${data.imported || 0} imported, ${data.updated || 0} updated, ${data.skipped || 0} skipped.`;
      setMessage(
        [summary, counts ? `WP totals — ${counts}${scheduledHint}.` : null, data.diagnosis || data.message, ...(data.pullErrors || [])]
          .filter(Boolean)
          .join(" ")
      );
      await loadConfig();
      await loadBlogs();
    } catch (err) {
      setError(err.message);
    } finally {
      setWpPulling(false);
    }
  };

  const publishNow = async (blogId) => {
    setPublishBusyId(blogId);
    setError("");
    try {
      const res = await fetch(`/api/admin/blogs/${blogId}/publish-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || data.errors?.join(" | ") || "Publish failed");
      setMessage(`Blog published via ${data.method || "delivery chain"}.`);
      await loadBlogs();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishBusyId("");
    }
  };

  const loadRevisions = async (blogId) => {
    setRevisionsForId(blogId);
    setLogsForId(null);
    setRevisions([]);
    try {
      const res = await fetch(`/api/admin/blogs/${blogId}/revisions`);
      const data = await res.json();
      if (res.ok) setRevisions(data.revisions || []);
    } catch {
      /* ignore */
    }
  };

  const restoreRevision = async (blogId, revisionId) => {
    if (!window.confirm("Restore this revision? Current content will be replaced.")) return;
    setError("");
    try {
      const res = await fetch(`/api/admin/blogs/${blogId}/revisions/${revisionId}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed");
      setMessage("Revision restored.");
      await loadBlogs();
      await loadRevisions(blogId);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadLogs = async (blogId) => {
    setLogsForId(blogId);
    setRevisionsForId(null);
    setLogs([]);
    try {
      const res = await fetch(`/api/admin/blogs/${blogId}/logs`);
      const data = await res.json();
      if (res.ok) setLogs(data.logs || []);
    } catch {
      /* ignore */
    }
  };

  const deleteBlog = async (blog) => {
    const label = blog.status === "deleted" ? "Permanently remove this soft-deleted row" : "Delete this blog from the queue";
    if (!window.confirm(`${label}? A WordPress pull can re-import it if the post still exists on the site.`)) return;
    setDeleteBusyId(blog.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/blogs/${blog.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setMessage(blog.status === "deleted" ? "Soft-deleted row removed." : "Blog deleted.");
      await loadBlogs();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteBusyId("");
    }
  };

  const resendForApproval = async (blog) => {
    if (
      !window.confirm(
        `Resend "${blog.title}" for approval? Approvers will get a new email and status will return to pending.`
      )
    ) {
      return;
    }
    setPublishBusyId(blog.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/blogs/${blog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_for_approval" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resend failed");
      setMessage(data.warning || `Resent "${blog.title}" for approval.`);
      await loadBlogs();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishBusyId("");
    }
  };

  const purgeSoftDeleted = async () => {
    if (!selectedSite || softDeletedCount === 0) return;
    if (!window.confirm(`Hard-delete all ${softDeletedCount} soft-deleted row(s) for this site? WordPress posts are untouched — a pull can re-import them.`)) return;
    setPurgeBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/blogs/purge-soft-deleted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteLink: selectedSite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purge failed");
      setMessage(`Removed ${data.purged || 0} soft-deleted row(s).`);
      await loadBlogs();
    } catch (err) {
      setError(err.message);
    } finally {
      setPurgeBusy(false);
    }
  };

  const submitBlog = async (e) => {
    e.preventDefault();
    if (!selectedSite) {
      setError("Select a client site first.");
      return;
    }
    if (isRichTextEmpty(form.content)) {
      setError("Content is required.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const fd = new FormData();
      fd.set("title", form.title);
      fd.set("content", form.content);
      fd.set("excerpt", form.excerpt);
      fd.set("slug", form.slug);
      fd.set("selectedSite", selectedSite);
      fd.set("wpStatus", form.wpStatus);
      fd.set("categories", form.categories);
      fd.set("tags", form.tags);
      fd.set("featuredImageAlt", form.featuredImageAlt);
      fd.set("seoTitle", form.seoTitle);
      fd.set("metaDescription", form.metaDescription);
      fd.set("focusKeyword", form.focusKeyword);
      if (form.scheduledFor) {
        const iso = datetimeLocalToUtcIso(form.scheduledFor);
        if (iso) fd.set("scheduledFor", iso);
      }
      if (form.approveOnAssignment) fd.set("approveOnAssignment", "1");
      if (featuredFile) fd.set("featuredImage", featuredFile);

      const res = await fetch("/api/admin/blogs", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create blog");

      setMessage(`Blog "${data.blog?.title}" created and sent for approval.`);
      setForm({
        title: "",
        slug: "",
        excerpt: "",
        content: "",
        wpStatus: "draft",
        scheduledFor: "",
        categories: "",
        tags: "",
        featuredImageAlt: "",
        seoTitle: "",
        metaDescription: "",
        focusKeyword: "",
        approveOnAssignment: false,
      });
      setFeaturedFile(null);
      await loadBlogs();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FiFileText className="text-[#1d9c35]" />
          Create Blog
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          WordPress-shaped content goes through approval, then publishes via your site delivery chain (webhook, WordPress, API, or email).
        </p>
      </div>

      {canManageContent ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-800"
          >
            <FiSettings /> Site publish settings {showConfig ? "▾" : "▸"}
          </button>
          {showConfig ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold uppercase text-gray-500">Delivery order (comma-separated)</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={(config.deliveryChain || []).join(", ")}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      deliveryChain: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">Webhook URL</span>
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={config.webhookUrl || ""} onChange={(e) => setConfig((c) => ({ ...c, webhookUrl: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">Webhook secret</span>
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={config.webhookSecret || ""} onChange={(e) => setConfig((c) => ({ ...c, webhookSecret: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">WordPress site URL</span>
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={config.wordpressUrl || ""} onChange={(e) => setConfig((c) => ({ ...c, wordpressUrl: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">WP username</span>
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={config.wordpressUsername || ""} onChange={(e) => setConfig((c) => ({ ...c, wordpressUsername: e.target.value }))} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold uppercase text-gray-500">WP application password</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  type="password"
                  value={config.wordpressAppPassword || ""}
                  onChange={(e) => setConfig((c) => ({ ...c, wordpressAppPassword: e.target.value }))}
                  placeholder="Paste once, then Save publish settings"
                />
                <p className="mt-1 text-xs text-gray-500">
                  After creating a password in WordPress, paste it here and click <strong>Save publish settings</strong> before Test or Pull.
                  Pull only uses the saved password — if WordPress shows &quot;never used&quot;, this password has not reached WordPress yet (or you are looking at a different app password entry).
                </p>
              </label>
              <label className="flex items-center gap-2 md:col-span-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(config.wordpressPullEnabled)}
                  onChange={(e) => setConfig((c) => ({ ...c, wordpressPullEnabled: e.target.checked }))}
                />
                Enable automatic WordPress draft pull (hourly cron)
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold uppercase text-gray-500">Automatic pull statuses (cron only)</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={(config.wordpressPullStatuses || ["draft", "future"]).join(", ")}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      wordpressPullStatuses: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    }))
                  }
                  placeholder="draft, future"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Hourly cron pulls all scheduled posts plus up to 3 unscheduled drafts (first at 11:59, then 12:59 on following days). Manual pull can fetch everything.
                </p>
              </label>
              {config.lastWordpressPullAt ? (
                <p className="md:col-span-2 text-xs text-gray-500">
                  Last pull: {new Date(config.lastWordpressPullAt).toLocaleString()}
                </p>
              ) : null}
              <div className="md:col-span-2 flex flex-wrap items-end gap-3">
                <label className="block min-w-[160px]">
                  <span className="text-xs font-semibold uppercase text-gray-500">WordPress post ID</span>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={wpPostId}
                    onChange={(e) => setWpPostId(e.target.value)}
                    placeholder="e.g. 1234"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 pb-2">
                  <input
                    type="checkbox"
                    checked={wpIncludeTrash}
                    onChange={(e) => setWpIncludeTrash(e.target.checked)}
                  />
                  Include trash
                </label>
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={testWordpress}
                  disabled={wpTesting || configLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-50"
                >
                  {wpTesting ? "Testing…" : "Test WordPress connection"}
                </button>
                <button
                  type="button"
                  onClick={() => pullWordpressDrafts({ onlyScheduled: false })}
                  disabled={wpPulling || configLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1d9c35] text-[#1d9c35] text-sm font-semibold disabled:opacity-50"
                >
                  <FiRefreshCw /> {wpPulling ? "Pulling…" : "Pull all drafts"}
                </button>
                <button
                  type="button"
                  onClick={() => pullWordpressDrafts({ onlyScheduled: true })}
                  disabled={wpPulling || configLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-50"
                >
                  Pull scheduled only
                </button>
                <button
                  type="button"
                  onClick={runWordpressDiagnostics}
                  disabled={wpTesting || configLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-400 text-amber-900 text-sm font-semibold disabled:opacity-50"
                >
                  {wpTesting ? "Running…" : "Show diagnostics"}
                </button>
                <button
                  type="button"
                  onClick={() => pullWordpressDrafts({ byPostId: true })}
                  disabled={wpPulling || configLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-50"
                >
                  Pull by post ID
                </button>
              </div>
              <WordpressDiagnosticsPanel diagnostics={wpDiagnostics} />
              <p className="md:col-span-2 text-xs text-gray-500">
                If pulls return 0, create the application password on a WordPress Administrator/Editor account (not a limited user). In wp-admin, open the post and copy the ID from the URL (?post=123).
              </p>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">Custom API URL</span>
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={config.apiUrl || ""} onChange={(e) => setConfig((c) => ({ ...c, apiUrl: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">API key</span>
                <input className="mt-1 w-full border rounded-lg px-3 py-2" type="password" value={config.apiKey || ""} onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold uppercase text-gray-500">Email fallback recipients</span>
                <input className="mt-1 w-full border rounded-lg px-3 py-2" value={config.emailRecipients || ""} onChange={(e) => setConfig((c) => ({ ...c, emailRecipients: e.target.value }))} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold uppercase text-gray-500">Inbound API secret</span>
                <div className="mt-1 flex gap-2">
                  <input
                    className="flex-1 border rounded-lg px-3 py-2 font-mono text-sm"
                    value={config.inboundSecret || ""}
                    onChange={(e) => setConfig((c) => ({ ...c, inboundSecret: e.target.value }))}
                    placeholder="Generate or paste a secret"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const bytes = new Uint8Array(24);
                      crypto.getRandomValues(bytes);
                      const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
                      setConfig((c) => ({ ...c, inboundSecret: secret }));
                    }}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold hover:bg-gray-50"
                  >
                    Generate
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Send as header <code className="font-mono">x-blog-secret</code>. Global fallback:{" "}
                  <code className="font-mono">BLOG_INBOUND_SECRET</code>.
                </p>
              </label>
              <InboundApiDocsPanel
                contentType="blog"
                siteKey={selectedSite}
                inboundSecret={config.inboundSecret}
                className="md:col-span-2"
              />
              <EmailInboundConfigFields config={config} setConfig={setConfig} contentType="blog" />
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={testEmailInbound}
                  disabled={emailTesting || configLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {emailTesting ? "Testing…" : "Test IMAP connection"}
                </button>
                <button
                  type="button"
                  onClick={pullEmailInbound}
                  disabled={emailPulling || configLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  <FiRefreshCw /> {emailPulling ? "Pulling…" : "Pull blog emails now"}
                </button>
              </div>
              <button type="button" onClick={saveConfig} disabled={configLoading} className="md:col-span-2 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
                <FiSave /> {configLoading ? "Saving…" : "Save publish settings"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {canManageContent && selectedSite ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Blog queue for {selectedSite}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {softDeletedCount > 0 ? (
                <button
                  type="button"
                  onClick={purgeSoftDeleted}
                  disabled={purgeBusy || blogsLoading}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-50"
                >
                  <FiTrash2 /> {purgeBusy ? "Purging…" : `Purge ${softDeletedCount} soft-deleted`}
                </button>
              ) : null}
              <button
                type="button"
                onClick={loadBlogs}
                disabled={blogsLoading}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                <FiRefreshCw /> Refresh
              </button>
            </div>
          </div>
          {blogsLoading ? (
            <p className="text-sm text-gray-500">Loading blogs…</p>
          ) : blogs.length === 0 ? (
            <p className="text-sm text-gray-500">No blogs for this site yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 border-b">
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Publish</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {blogs.map((blog) => (
                    <tr
                      key={blog.id}
                      className={`border-b border-gray-100 align-top ${blog.status === "deleted" ? "bg-red-50/60" : ""}`}
                    >
                      <td className="py-2 pr-3 font-medium text-gray-900">
                        {blog.title}
                        {blog.status === "deleted" ? (
                          <span className="ml-2 text-[10px] uppercase font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                            soft deleted
                          </span>
                        ) : null}
                        {blog.externalId ? (
                          <span className="block text-xs font-normal text-gray-500">WP #{blog.externalId}</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="block">{blog.status}</span>
                        <span className="text-xs text-gray-500">{blog.publishStatus}</span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">
                        {blog.scheduledFor ? formatScheduleShort(blog.scheduledFor) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{blog.source || "manual"}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={publishBusyId === blog.id || blog.publishStatus === "published"}
                            onClick={() => publishNow(blog.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 text-xs font-semibold disabled:opacity-50"
                          >
                            <FiZap /> {publishBusyId === blog.id ? "Publishing…" : "Publish now"}
                          </button>
                          {blog.status === "declined" ? (
                            <button
                              type="button"
                              disabled={publishBusyId === blog.id || blog.publishStatus === "published"}
                              onClick={() => resendForApproval(blog)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold disabled:opacity-50"
                            >
                              <FiRefreshCw /> Resend for approval
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => loadLogs(blog.id)}
                            className="px-2 py-1 rounded border border-gray-200 text-xs font-semibold text-gray-700"
                          >
                            Logs
                          </button>
                          <button
                            type="button"
                            onClick={() => loadRevisions(blog.id)}
                            className="px-2 py-1 rounded border border-gray-200 text-xs font-semibold text-gray-700"
                          >
                            History
                          </button>
                          <button
                            type="button"
                            disabled={deleteBusyId === blog.id}
                            onClick={() => deleteBlog(blog)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            <FiTrash2 /> {blog.status === "deleted" ? "Hard delete" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {revisionsForId ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs space-y-2">
              <p className="font-semibold text-gray-800">Revision history</p>
              {revisions.length === 0 ? (
                <p className="text-gray-500">No revisions recorded yet.</p>
              ) : (
                revisions.map((rev) => (
                  <div key={rev.id} className="border-b border-gray-200 pb-2 last:border-0 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-800">{rev.action}</span>
                    <span className="text-gray-500">{new Date(rev.createdAt).toLocaleString()}</span>
                    {rev.actor?.name ? <span className="text-gray-500">by {rev.actor.name}</span> : null}
                    <button
                      type="button"
                      onClick={() => restoreRevision(revisionsForId, rev.id)}
                      className="ml-auto px-2 py-1 rounded border border-gray-300 text-xs font-semibold"
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
          {logsForId ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs space-y-2">
              <p className="font-semibold text-gray-800">Publish logs</p>
              {logs.length === 0 ? (
                <p className="text-gray-500">No publish attempts yet.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="border-b border-gray-200 pb-2 last:border-0">
                    <span className={log.success ? "text-green-700" : "text-red-700"}>
                      {log.success ? "OK" : "FAIL"}
                    </span>{" "}
                    · {log.method} · {new Date(log.createdAt).toLocaleString()}
                    {log.responseBody ? <pre className="mt-1 whitespace-pre-wrap text-gray-600">{log.responseBody}</pre> : null}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={submitBlog} className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-gray-500">Title</span>
          <input required className="mt-1 w-full border rounded-lg px-3 py-2 text-lg font-medium" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500">Slug</span>
            <input className="mt-1 w-full border rounded-lg px-3 py-2 font-mono text-sm" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="auto-from-title" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500">Status</span>
            <select className="mt-1 w-full border rounded-lg px-3 py-2" value={form.wpStatus} onChange={(e) => setForm((f) => ({ ...f, wpStatus: e.target.value }))}>
              <option value="draft">Draft</option>
              <option value="future">Scheduled</option>
              <option value="publish">Publish</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-gray-500">Excerpt</span>
          <textarea className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[72px]" value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} />
        </label>
        <label className="block">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold uppercase text-gray-500">Content</span>
            <HumanizeTextButton
              type="blog"
              text={form.content}
              onHumanized={(html) => setForm((f) => ({ ...f, content: html }))}
            />
          </div>
          <div className="mt-1">
            <BlogRichTextEditor
              value={form.content}
              onChange={(html) => setForm((f) => ({ ...f, content: html }))}
              minHeight={260}
            />
          </div>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-xs font-semibold uppercase text-gray-500">Featured image</span>
            <FileChooseField
              id="admin-blog-featured-image"
              accept="image/jpeg,image/png,image/webp,image/gif"
              file={featuredFile}
              onFileChange={setFeaturedFile}
              label="Choose image"
              hint="Optional featured image for the blog post."
              className="mt-1"
            />
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500">Featured image alt text</span>
            <input className="mt-1 w-full border rounded-lg px-3 py-2" value={form.featuredImageAlt} onChange={(e) => setForm((f) => ({ ...f, featuredImageAlt: e.target.value }))} />
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold uppercase text-gray-500">SEO title</span>
            <input className="mt-1 w-full border rounded-lg px-3 py-2" value={form.seoTitle} onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))} placeholder="Optional — overrides default title in search results" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold uppercase text-gray-500">Meta description</span>
            <textarea className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[64px]" value={form.metaDescription} onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))} placeholder="Optional — search snippet" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500">Focus keyword</span>
            <input className="mt-1 w-full border rounded-lg px-3 py-2" value={form.focusKeyword} onChange={(e) => setForm((f) => ({ ...f, focusKeyword: e.target.value }))} />
            <FocusKeywordPlannerHint keyword={form.focusKeyword} />
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500">Categories (comma or JSON array)</span>
            <input className="mt-1 w-full border rounded-lg px-3 py-2" value={form.categories} onChange={(e) => setForm((f) => ({ ...f, categories: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500">Tags (comma or JSON array)</span>
            <input className="mt-1 w-full border rounded-lg px-3 py-2" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-gray-500">
            Publish date & time ({timezoneShortLabel()})
          </span>
          <input type="datetime-local" className="mt-1 w-full max-w-xs border rounded-lg px-3 py-2" value={form.scheduledFor} onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value }))} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.approveOnAssignment} onChange={(e) => setForm((f) => ({ ...f, approveOnAssignment: e.target.checked }))} />
          Approve immediately (skip client review)
        </label>
        {error ? <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p> : null}
        {message ? <p className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{message}</p> : null}
        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
          <FiFileText /> {loading ? "Saving…" : "Send blog for approval"}
        </button>
      </form>
    </div>
  );
}
