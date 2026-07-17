"use client";

import { useState } from "react";
import { FiSend } from "react-icons/fi";

/**
 * Superadmin: send all client report PDFs for the current site to its approvers.
 */
export default function SendReportsButton({ activeSite = "", className = "" }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!activeSite) {
      setError("No site selected.");
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey: activeSite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      const sent = (data.results || []).filter((r) => r.ok).length;
      setMessage(sent ? `Sent ${sent} report pack(s) to approver(s).` : "No approvers matched this site.");
    } catch (e) {
      setError(e.message || "Send failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleSend}
        disabled={working || !activeSite}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
      >
        <FiSend className="w-4 h-4" />
        {working ? "Sending…" : "Send all reports"}
      </button>
      {message ? <p className="mt-1 text-xs text-green-700">{message}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
