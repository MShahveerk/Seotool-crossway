"use client";

import ApprovalMediaPreview from "./ApprovalMediaPreview";

/**
 * Primary + up to 3 backups. Promote a backup before approval.
 */
export default function BackupImageSwitcher({
  primaryPath,
  backupPaths = [],
  alt = "",
  disabled = false,
  promoting = false,
  onPromote,
  className = "",
}) {
  const backups = (Array.isArray(backupPaths) ? backupPaths : [])
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!primaryPath && !backups.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-slate-50">
        {primaryPath ? (
          <ApprovalMediaPreview
            src={primaryPath}
            alt={alt || "Primary creative"}
            className="max-h-72 w-full object-contain bg-black/5"
          />
        ) : null}
      </div>
      {backups.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Backup creatives — tap to use as primary (before approval)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {backups.map((path, idx) => (
              <button
                key={`${path}-${idx}`}
                type="button"
                disabled={disabled || promoting}
                onClick={() => onPromote?.(idx)}
                className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9c35] disabled:opacity-50"
                title="Use as primary image"
              >
                <ApprovalMediaPreview
                  src={path}
                  alt={`Backup ${idx + 1}`}
                  className="aspect-square w-full object-cover transition group-hover:opacity-90"
                />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
                  Use #{idx + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
