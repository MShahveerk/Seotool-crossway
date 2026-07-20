"use client";

import { useState } from "react";
import { FiRefreshCw } from "react-icons/fi";

export default function HumanizeTextButton({
  text = "",
  type = "caption",
  onHumanized,
  disabled = false,
  className = "",
  size = "sm",
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    const raw = String(text || "").trim();
    if (!raw) {
      setError("Add some text first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/content/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw, type }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Humanize failed.");
      onHumanized?.(data.text);
    } catch (err) {
      setError(err.message || "Humanize failed.");
    } finally {
      setBusy(false);
    }
  };

  const pad = size === "xs" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs";

  return (
    <span className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        className={`inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 ${pad}`}
        title="Rewrite with AI to sound more natural"
      >
        <FiRefreshCw className={busy ? "animate-spin" : ""} />
        {busy ? "Humanizing…" : "Humanize"}
      </button>
      {error ? <span className="text-[11px] text-red-600 max-w-[16rem] text-right">{error}</span> : null}
    </span>
  );
}
