"use client";

export function formatNum(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

export function formatPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0%";
  return `${(v * 100).toFixed(1)}%`;
}

export function formatPos(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

const RANGES = [
  { id: "7d", label: "7d" },
  { id: "28d", label: "28d" },
  { id: "3m", label: "3m" },
  { id: "6m", label: "6m" },
  { id: "12m", label: "12m" },
];

export default function SeoPanelShell({
  title,
  description,
  selectedSite,
  range,
  onRangeChange,
  loading,
  error,
  children,
  action,
}) {
  if (!selectedSite || (!String(selectedSite).startsWith("http") && !/^\d+$/.test(String(selectedSite)))) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-600">Select a website from the Client Account dropdown to use this tool.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-h-[calc(100vh-2rem)]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description ? <p className="mt-1 text-sm text-gray-500 max-w-2xl">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onRangeChange ? (
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onRangeChange(r.id)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    range === r.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          ) : null}
          {action}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
