"use client";

import { useCallback, useEffect, useState } from "react";
import { FiRefreshCw, FiSave, FiSettings } from "react-icons/fi";
import { isMetaPageId } from "@/lib/siteAccess";
import InboundApiDocsPanel from "./InboundApiDocsPanel";
import EmailInboundConfigFields from "./EmailInboundConfigFields";

const DEFAULT_CONFIG = {
  enabled: true,
  inboundSecret: "",
  metaPageAccessToken: "",
  metaPullEnabled: false,
  facebookPageId: "",
  instagramUserId: "",
  lastMetaPullAt: null,
  emailInboundEnabled: false,
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPassword: "",
  imapFolder: "INBOX",
  lastEmailPullAt: null,
  deliveryChain: ["meta", "webhook", "api", "email"],
  webhookUrl: "",
  webhookSecret: "",
  apiUrl: "",
  apiKey: "",
  emailRecipients: "",
  publishToFacebook: true,
  publishToInstagram: true,
};

function generateSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function PostPublishConfigPanel({ selectedSite = "" }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [metaPulling, setMetaPulling] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailPulling, setEmailPulling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isMeta = selectedSite && isMetaPageId(selectedSite);

  const loadConfig = useCallback(async () => {
    if (!selectedSite) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ siteKey: selectedSite });
      const res = await fetch(`/api/admin/post-publish-config?${q}`);
      const data = await res.json();
      if (res.ok) {
        setConfig({ ...DEFAULT_CONFIG, ...(data.config || {}) });
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const pullMetaDrafts = async () => {
    if (!selectedSite) return;
    setMetaPulling(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/meta/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey: selectedSite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Meta pull failed");
      setMessage(data.message || "Meta pull complete.");
      await loadConfig();
    } catch (err) {
      setError(err.message);
    } finally {
      setMetaPulling(false);
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
        body: JSON.stringify({ siteKey: selectedSite, contentType: "post", action: "test" }),
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
        body: JSON.stringify({ siteKey: selectedSite, contentType: "post", action: "pull" }),
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

  const saveConfig = async () => {
    if (!selectedSite) {
      setError("Select a client account first.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/post-publish-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          siteKey: selectedSite,
          facebookPageId: isMeta ? selectedSite : config.facebookPageId || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings");
      setConfig({ ...DEFAULT_CONFIG, ...data.config });
      setMessage("Post ingest settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setShowConfig((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-800"
      >
        <FiSettings /> Post ingest &amp; publish settings {showConfig ? "▾" : "▸"}
      </button>

      {showConfig ? (
        <div className="mt-4 space-y-4 text-sm">
          {!selectedSite ? (
            <p className="text-gray-500">Select a client account in the sidebar to configure inbound posts for that Meta page or site.</p>
          ) : (
            <>
              {message ? <p className="text-emerald-700 text-sm font-medium">{message}</p> : null}
              {error ? <p className="text-red-600 text-sm">{error}</p> : null}

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(config.enabled)}
                  onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
                />
                Enable inbound API for this account
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      onClick={() => setConfig((c) => ({ ...c, inboundSecret: generateSecret() }))}
                      className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold hover:bg-gray-50"
                    >
                      Generate
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Send as header <code className="font-mono">x-post-secret</code>. Override globally with{" "}
                    <code className="font-mono">POST_INBOUND_SECRET</code> in env.
                  </p>
                </label>

                {isMeta ? (
                  <label className="block md:col-span-2">
                    <span className="text-xs font-semibold uppercase text-gray-500">
                      Meta page access token (this page only)
                    </span>
                    <input
                      className="mt-1 w-full border rounded-lg px-3 py-2 font-mono text-sm"
                      type="password"
                      value={config.metaPageAccessToken || ""}
                      onChange={(e) => setConfig((c) => ({ ...c, metaPageAccessToken: e.target.value }))}
                      placeholder="Optional — overrides global META_PAGE_ACCESS_TOKEN for publish"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Used when scheduled posts publish to Facebook/Instagram for page ID{" "}
                      <span className="font-mono">{selectedSite}</span>. Leave blank to use the app-wide token.
                    </p>
                  </label>
                ) : null}

                <div className="md:col-span-2 border-t border-gray-200 pt-4 mt-2">
                  <p className="font-semibold text-gray-900 mb-2">Outbound delivery chain</p>
                  <p className="text-xs text-gray-500 mb-3">
                    When a post is approved and scheduled, Crossway tries each method in order until one succeeds.
                  </p>
                  <label className="block md:col-span-2 mb-3">
                    <span className="text-xs font-semibold uppercase text-gray-500">Delivery order</span>
                    <input
                      className="mt-1 w-full border rounded-lg px-3 py-2 font-mono text-sm"
                      value={(config.deliveryChain || []).join(", ")}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          deliveryChain: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        }))
                      }
                      placeholder="meta, webhook, api, email"
                    />
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-gray-500">Webhook URL</span>
                      <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={config.webhookUrl || ""} onChange={(e) => setConfig((c) => ({ ...c, webhookUrl: e.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-gray-500">Webhook secret</span>
                      <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={config.webhookSecret || ""} onChange={(e) => setConfig((c) => ({ ...c, webhookSecret: e.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-gray-500">Custom API URL</span>
                      <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={config.apiUrl || ""} onChange={(e) => setConfig((c) => ({ ...c, apiUrl: e.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-gray-500">API key</span>
                      <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" type="password" value={config.apiKey || ""} onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))} />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-xs font-semibold uppercase text-gray-500">Email fallback recipients</span>
                      <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={config.emailRecipients || ""} onChange={(e) => setConfig((c) => ({ ...c, emailRecipients: e.target.value }))} placeholder="ops@client.com, smm@agency.com" />
                    </label>
                    {isMeta ? (
                      <>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={config.publishToFacebook !== false} onChange={(e) => setConfig((c) => ({ ...c, publishToFacebook: e.target.checked }))} />
                          Publish to Facebook (meta step)
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={config.publishToInstagram !== false} onChange={(e) => setConfig((c) => ({ ...c, publishToInstagram: e.target.checked }))} />
                          Publish to Instagram (meta step)
                        </label>
                      </>
                    ) : null}
                  </div>
                </div>

                {isMeta ? (
                  <>
                    <label className="flex items-center gap-2 md:col-span-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(config.metaPullEnabled)}
                        onChange={(e) => setConfig((c) => ({ ...c, metaPullEnabled: e.target.checked }))}
                      />
                      Pull scheduled posts from Meta (hourly cron)
                    </label>
                    {config.lastMetaPullAt ? (
                      <p className="md:col-span-2 text-xs text-gray-500">
                        Last Meta pull: {new Date(config.lastMetaPullAt).toLocaleString()}
                      </p>
                    ) : null}
                    <div className="md:col-span-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={pullMetaDrafts}
                        disabled={metaPulling || loading}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#1d9c35] px-3 py-2 text-sm font-semibold text-[#1d9c35] disabled:opacity-50"
                      >
                        <FiRefreshCw /> {metaPulling ? "Pulling…" : "Pull Meta drafts now"}
                      </button>
                    </div>
                  </>
                ) : null}

                <EmailInboundConfigFields config={config} setConfig={setConfig} contentType="post" />

                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={testEmailInbound}
                    disabled={emailTesting || loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {emailTesting ? "Testing…" : "Test IMAP connection"}
                  </button>
                  <button
                    type="button"
                    onClick={pullEmailInbound}
                    disabled={emailPulling || loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    <FiRefreshCw /> {emailPulling ? "Pulling…" : "Pull email now"}
                  </button>
                </div>
              </div>

              <InboundApiDocsPanel
                contentType="post"
                siteKey={selectedSite}
                inboundSecret={config.inboundSecret}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <FiSave /> {loading ? "Saving…" : "Save post settings"}
                </button>
                <button
                  type="button"
                  onClick={loadConfig}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  <FiRefreshCw /> Reload
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
