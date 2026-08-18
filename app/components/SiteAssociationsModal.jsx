"use client";

import { useState, useEffect } from "react";
import { FiX, FiPlus, FiEdit2, FiTrash2, FiSave, FiAlertCircle, FiCheck, FiGlobe } from "react-icons/fi";

export default function SiteAssociationsModal({ isOpen, onClose }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    siteUrl: "",
    gtmContainerId: "",
    facebookPageId: "",
    instagramUserId: ""
  });

  const [metaAccounts, setMetaAccounts] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchSites();
      fetchMetaAccounts();
    }
  }, [isOpen]);

  const fetchMetaAccounts = async () => {
    try {
      const res = await fetch("/api/admin/meta-accounts");
      const data = await res.json().catch(() => ({}));
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      setMetaAccounts(accounts);
      if (!res.ok || (accounts.length === 0 && data.error)) {
        console.warn("Meta accounts:", data.error || `HTTP ${res.status}`);
        if (!res.ok) setError(data.error || `Failed to load Meta accounts (${res.status})`);
      }
    } catch (err) {
      console.error("Failed to load Meta accounts in modal", err);
      setMetaAccounts([]);
    }
  };

  const fetchSites = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sites");
      if (!res.ok) throw new Error("Failed to fetch sites");
      const data = await res.json();
      setSites(data.sites || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (site) => {
    setEditingId(site.id);
    setFormData({
      siteUrl: site.siteUrl,
      gtmContainerId: site.gtmContainerId || "",
      facebookPageId: site.facebookPageId || "",
      instagramUserId: site.instagramUserId || ""
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ siteUrl: "", gtmContainerId: "", facebookPageId: "", instagramUserId: "" });
    setError(null);
  };

  const handleCreateNew = () => {
    setEditingId("new");
    setFormData({ siteUrl: "", gtmContainerId: "", facebookPageId: "", instagramUserId: "" });
  };

  const handleSave = async () => {
    setError(null);
    if (!formData.siteUrl.trim()) {
      setError("Site URL is required");
      return;
    }

    try {
      const url = editingId === "new" ? "/api/admin/sites" : `/api/admin/sites/${editingId}`;
      const method = editingId === "new" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save site");

      await fetchSites();
      handleCancel();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this site configuration? Users will lose access to its metrics.")) return;

    try {
      const res = await fetch(`/api/admin/sites/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete site");
      await fetchSites();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--cw-surface)] border border-[var(--cw-hairline)] rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-[var(--cw-hairline)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--cw-raised)] flex items-center justify-center">
              <FiGlobe className="w-5 h-5 text-[var(--cw-ink)]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--cw-ink)]">Manage Site Associations</h2>
              <p className="text-sm text-[var(--cw-ink-muted)]">Configure global website metrics and Social Media bindings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--cw-ink-faint)] hover:text-[var(--cw-ink)] hover:bg-[var(--cw-overlay)] rounded-xl transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-[var(--cw-canvas)]">
          {error && (
            <div className="mb-6 p-4 bg-[color-mix(in_srgb,var(--cw-danger)_12%,var(--cw-surface))] text-[var(--cw-danger)] rounded-xl flex items-start gap-3 border border-[color-mix(in_srgb,var(--cw-danger)_35%,var(--cw-hairline))]">
              <FiAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Something went wrong</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="mb-6 flex justify-between items-center">
            <h3 className="text-sm font-bold text-[var(--cw-ink)] uppercase tracking-wider">Registered Sites</h3>
            {editingId !== "new" && (
              <button
                onClick={handleCreateNew}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--cw-neon)] text-[var(--cw-neon-ink)] rounded-lg text-sm font-semibold hover:bg-[var(--cw-neon-deep)] transition-colors"
              >
                <FiPlus className="w-4 h-4" />
                Onboard Website
              </button>
            )}
          </div>

          <div className="space-y-4">
            {editingId === "new" && (
              <div className="bg-[var(--cw-surface)] p-5 rounded-xl border border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] shadow-sm ring-1 ring-[color-mix(in_srgb,var(--cw-neon)_25%,transparent)]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[var(--cw-ink-faint)] mb-1 uppercase tracking-wider">Website URL *</label>
                    <input
                      type="url"
                      value={formData.siteUrl}
                      onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                      placeholder="https://example.com"
                      className="w-full px-3 py-2 border border-[var(--cw-hairline)] rounded-lg bg-[var(--cw-raised)] text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:ring-2 focus:ring-[var(--cw-neon)] focus:border-[var(--cw-neon)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--cw-ink-faint)] mb-1 uppercase tracking-wider">GTM Container ID</label>
                    <input
                      type="text"
                      value={formData.gtmContainerId}
                      onChange={(e) => setFormData({ ...formData, gtmContainerId: e.target.value })}
                      placeholder="GTM-XXXXXXX"
                      className="w-full px-3 py-2 border border-[var(--cw-hairline)] rounded-lg bg-[var(--cw-raised)] text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:ring-2 focus:ring-[var(--cw-neon)] focus:border-[var(--cw-neon)]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[var(--cw-ink-faint)] mb-1 uppercase tracking-wider">Link Meta Page Account</label>
                    <select
                      value={metaAccounts.find(a => a.facebookPageId === formData.facebookPageId)?.id || ""}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const match = metaAccounts.find(a => a.id === selectedId);
                        if (match) {
                          setFormData({
                            ...formData,
                            facebookPageId: match.facebookPageId || "",
                            instagramUserId: match.instagramUserId || "",
                          });
                        } else {
                          setFormData({
                            ...formData,
                            facebookPageId: "",
                            instagramUserId: "",
                          });
                        }
                      }}
                      className="w-full px-3 py-2 border border-[var(--cw-hairline)] rounded-lg bg-[var(--cw-raised)] text-[var(--cw-ink)] focus:ring-2 focus:ring-[var(--cw-neon)] focus:border-[var(--cw-neon)] text-sm"
                    >
                      <option value="">-- No Linked Meta Page --</option>
                      {metaAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} (FB: {acc.facebookPageId} {acc.instagramUserId ? `| IG: ${acc.instagramUserId}` : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-[var(--cw-hairline)]">
                  <button onClick={handleCancel} className="px-4 py-2 text-sm font-semibold text-[var(--cw-ink-muted)] hover:text-[var(--cw-ink)]">Cancel</button>
                  <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-[var(--cw-neon)] text-[var(--cw-neon-ink)] rounded-lg text-sm font-bold hover:bg-[var(--cw-neon-deep)] transition-colors">
                    <FiSave className="w-4 h-4" /> Save
                  </button>
                </div>
              </div>
            )}

            {loading && sites.length === 0 ? (
              <div className="text-center py-8 text-[var(--cw-ink-muted)]">Loading sites...</div>
            ) : sites.length === 0 && editingId !== "new" ? (
              <div className="text-center py-12 bg-[var(--cw-surface)] rounded-xl border border-[var(--cw-hairline)]">
                <FiGlobe className="w-12 h-12 text-[var(--cw-ink-faint)] mx-auto mb-4" />
                <p className="text-[var(--cw-ink-muted)]">No websites onboarded yet.</p>
              </div>
            ) : (
              sites.map((site) => (
                editingId === site.id ? (
                  <div key={site.id} className="bg-[var(--cw-surface)] p-5 rounded-xl border border-[color-mix(in_srgb,var(--cw-neon)_45%,var(--cw-hairline))] shadow-sm ring-1 ring-[color-mix(in_srgb,var(--cw-neon)_25%,transparent)]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-[var(--cw-ink-faint)] mb-1 uppercase tracking-wider">Website URL *</label>
                        <input
                          type="url"
                          value={formData.siteUrl}
                          onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                          className="w-full px-3 py-2 border border-[var(--cw-hairline)] rounded-lg bg-[var(--cw-raised)] text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:ring-2 focus:ring-[var(--cw-neon)] focus:border-[var(--cw-neon)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--cw-ink-faint)] mb-1 uppercase tracking-wider">GTM Container ID</label>
                        <input
                          type="text"
                          value={formData.gtmContainerId}
                          onChange={(e) => setFormData({ ...formData, gtmContainerId: e.target.value })}
                          className="w-full px-3 py-2 border border-[var(--cw-hairline)] rounded-lg bg-[var(--cw-raised)] text-[var(--cw-ink)] placeholder:text-[var(--cw-ink-faint)] focus:ring-2 focus:ring-[var(--cw-neon)] focus:border-[var(--cw-neon)]"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-[var(--cw-ink-faint)] mb-1 uppercase tracking-wider">Link Meta Page Account</label>
                        <select
                          value={metaAccounts.find(a => a.facebookPageId === formData.facebookPageId)?.id || ""}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const match = metaAccounts.find(a => a.id === selectedId);
                            if (match) {
                              setFormData({
                                ...formData,
                                facebookPageId: match.facebookPageId || "",
                                instagramUserId: match.instagramUserId || "",
                              });
                            } else {
                              setFormData({
                                ...formData,
                                facebookPageId: "",
                                instagramUserId: "",
                              });
                            }
                          }}
                          className="w-full px-3 py-2 border border-[var(--cw-hairline)] rounded-lg bg-[var(--cw-raised)] text-[var(--cw-ink)] focus:ring-2 focus:ring-[var(--cw-neon)] focus:border-[var(--cw-neon)] text-sm"
                        >
                          <option value="">-- No Linked Meta Page --</option>
                          {metaAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} (FB: {acc.facebookPageId} {acc.instagramUserId ? `| IG: ${acc.instagramUserId}` : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-[var(--cw-hairline)]">
                      <button onClick={handleCancel} className="px-4 py-2 text-sm font-semibold text-[var(--cw-ink-muted)] hover:text-[var(--cw-ink)]">Cancel</button>
                      <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-[var(--cw-neon)] text-[var(--cw-neon-ink)] rounded-lg text-sm font-bold hover:bg-[var(--cw-neon-deep)] transition-colors">
                        <FiCheck className="w-4 h-4" /> Update
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={site.id} className="bg-[var(--cw-surface)] p-5 rounded-xl border border-[var(--cw-hairline)] flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-[var(--cw-hairline-strong)] transition-colors">
                    <div className="flex-1">
                      <h4 className="font-bold text-[var(--cw-ink)] text-lg">{site.siteUrl}</h4>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-mono text-[var(--cw-ink-muted)]">
                        {site.gtmContainerId ? (
                          <span className="px-2 py-1 bg-[var(--cw-raised)] rounded">GTM: {site.gtmContainerId}</span>
                        ) : null}
                        {site.facebookPageId ? (
                          <span className="px-2 py-1 bg-[var(--cw-raised)] rounded">
                            FB Page: {(() => {
                              const match = metaAccounts.find(a => a.facebookPageId === site.facebookPageId);
                              return match ? match.name : site.facebookPageId;
                            })()}
                          </span>
                        ) : null}
                        {site.instagramUserId ? (
                          <span className="px-2 py-1 bg-[var(--cw-raised)] rounded">IG Account</span>
                        ) : null}
                        {!site.gtmContainerId && !site.facebookPageId && !site.instagramUserId && (
                          <span className="text-[var(--cw-ink-faint)] italic">No tracking IDs configured</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleEdit(site)}
                        className="p-2 text-[var(--cw-ink-muted)] hover:text-[var(--cw-ink)] hover:bg-[var(--cw-overlay)] rounded-lg transition-colors"
                        title="Edit"
                      >
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(site.id)}
                        className="p-2 text-[var(--cw-danger)] hover:bg-[color-mix(in_srgb,var(--cw-danger)_18%,var(--cw-surface))] rounded-lg transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}