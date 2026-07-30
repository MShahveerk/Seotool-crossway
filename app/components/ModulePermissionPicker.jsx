"use client";

import {
  MODULES,
  MODULE_LABELS,
  MODULE_SUB_PERMISSIONS,
  getDefaultModulePermissionsForRole,
} from "@/lib/modulePermissions";

const MODULE_ORDER = [MODULES.GSC, MODULES.SEO, MODULES.SOCIAL, MODULES.BLOGS];

function clonePermissions(perms) {
  return {
    [MODULES.GSC]: [...(perms[MODULES.GSC] || [])],
    [MODULES.SEO]: [...(perms[MODULES.SEO] || [])],
    [MODULES.SOCIAL]: [...(perms[MODULES.SOCIAL] || [])],
    [MODULES.BLOGS]: [...(perms[MODULES.BLOGS] || [])],
  };
}

export default function ModulePermissionPicker({ value, onChange, role, disabled = false }) {
  const perms = value || getDefaultModulePermissionsForRole(role || "user");

  const toggleSection = (module, sectionId) => {
    if (disabled) return;
    const current = perms[module] || [];
    const next = current.includes(sectionId)
      ? current.filter((id) => id !== sectionId)
      : [...current, sectionId];
    onChange({ ...clonePermissions(perms), [module]: next });
  };

  const toggleModuleAll = (module) => {
    if (disabled) return;
    const allIds = MODULE_SUB_PERMISSIONS[module].map((p) => p.id);
    const current = perms[module] || [];
    const allSelected = allIds.every((id) => current.includes(id));
    onChange({
      ...clonePermissions(perms),
      [module]: allSelected ? [] : allIds,
    });
  };

  const applyRoleDefaults = () => {
    if (disabled) return;
    onChange(getDefaultModulePermissionsForRole(role || "user"));
  };

  return (
    <div className="col-span-1 md:col-span-2 rounded-xl border border-gray-200 dark:border-gray-300 p-4 space-y-4 bg-white/80">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-900">Module permissions</p>
          <p className="text-xs text-gray-600 mt-1">
            Choose Search Console, SEO, Social, and Blog access. Admin settings remain super admin only.
          </p>
        </div>
        <button
          type="button"
          onClick={applyRoleDefaults}
          disabled={disabled}
          className="text-xs font-semibold text-[#0a9e22] hover:underline disabled:opacity-50"
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
              className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={() => toggleModuleAll(module)}
                  disabled={disabled}
                  className="w-4 h-4 text-[#0EFF2A] border-gray-300 rounded focus:ring-[#0EFF2A]"
                />
                <span className="text-sm font-semibold text-gray-800">{MODULE_LABELS[module]}</span>
              </label>
              <div className="pl-6 space-y-1.5">
                {items.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={() => toggleSection(module, item.id)}
                      disabled={disabled}
                      className="w-3.5 h-3.5 text-[#0EFF2A] border-gray-300 rounded focus:ring-[#0EFF2A]"
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
