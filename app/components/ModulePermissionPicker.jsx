"use client";

import { useEffect, useRef } from "react";
import {
  MODULES,
  MODULE_LABELS,
  MODULE_SUB_PERMISSIONS,
  coerceModulePermissionsForForm,
} from "@/lib/modulePermissions";

const MODULE_ORDER = [MODULES.GSC, MODULES.SEO, MODULES.SOCIAL, MODULES.BLOGS, MODULES.REPORTS];

function IndeterminateCheckbox({ checked, indeterminate, onChange, disabled, className }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className={className}
    />
  );
}

export default function ModulePermissionPicker({ value, onChange, role, disabled = false }) {
  const perms = coerceModulePermissionsForForm(value, role || "user");

  const emit = (next) => onChange(coerceModulePermissionsForForm(next, role || "user"));

  const toggleSection = (module, sectionId) => {
    if (disabled) return;
    const current = perms[module] || [];
    const next = current.includes(sectionId)
      ? current.filter((id) => id !== sectionId)
      : [...current, sectionId];
    emit({ ...perms, [module]: next });
  };

  const toggleModuleAll = (module) => {
    if (disabled) return;
    const allIds = MODULE_SUB_PERMISSIONS[module].map((p) => p.id);
    const current = perms[module] || [];
    const allSelected = allIds.every((id) => current.includes(id));
    emit({ ...perms, [module]: allSelected ? [] : allIds });
  };

  const applyRoleDefaults = () => {
    if (disabled) return;
    emit(coerceModulePermissionsForForm(null, role || "user"));
  };

  return (
    <div className="rounded-xl border border-[var(--cw-hairline)] p-4 space-y-4 bg-[var(--cw-surface)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[var(--cw-ink)]">Module permissions</p>
          <p className="text-xs text-[var(--cw-ink-muted)] mt-1">
            Choose Search Console, SEO, Social, Blog, and Report Studio access. Admin settings remain super admin only.
          </p>
        </div>
        <button
          type="button"
          onClick={applyRoleDefaults}
          disabled={disabled}
          className="text-xs font-semibold text-[var(--cw-neon)] hover:text-[var(--cw-neon-deep)] hover:underline disabled:opacity-50"
        >
          Reset to role defaults
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {MODULE_ORDER.map((module) => {
          const items = MODULE_SUB_PERMISSIONS[module];
          const selected = perms[module] || [];
          const allSelected = items.every((p) => selected.includes(p.id));
          const someSelected = selected.length > 0 && !allSelected;

          return (
            <div
              key={module}
              className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-3 space-y-2"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <IndeterminateCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() => toggleModuleAll(module)}
                  disabled={disabled}
                  className="w-4 h-4 text-[var(--cw-neon)] accent-[var(--cw-neon)] border-[var(--cw-hairline)] bg-[var(--cw-raised)] rounded focus:ring-[var(--cw-neon)]"
                />
                <span className="text-sm font-semibold text-[var(--cw-ink)]">{MODULE_LABELS[module]}</span>
              </label>
              <div className="pl-6 space-y-1.5">
                {items.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer text-sm text-[var(--cw-ink-dim)] hover:text-[var(--cw-ink)]">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={() => toggleSection(module, item.id)}
                      disabled={disabled}
                      className="w-3.5 h-3.5 text-[var(--cw-neon)] accent-[var(--cw-neon)] border-[var(--cw-hairline)] bg-[var(--cw-raised)] rounded focus:ring-[var(--cw-neon)]"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
