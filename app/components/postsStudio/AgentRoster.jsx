"use client";

import { FiCheckCircle, FiAlertCircle, FiCpu, FiChevronDown } from "react-icons/fi";
import {
  AGENT_ROLES,
  PROVIDERS,
  IMAGE_PROVIDERS,
  modelsForProvider,
  defaultModelForProvider,
  inputClass,
} from "./studioConstants";
import ModelCombobox from "../studioShared/ModelCombobox";

const selectClass = `${inputClass} mt-1 appearance-none pr-8 text-xs font-semibold bg-white cursor-pointer`;

export default function AgentRoster({ config, onPatchSite }) {
  const ready = config?.agentReady || {};

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Agent models</p>
          <p className="text-xs text-gray-500">
            Pick a suggested model or type any API model id. Changes apply after you click Save.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {AGENT_ROLES.map((role, i) => {
          const ok = Boolean(ready[role.readyKey]);
          const isImage = role.id === "image";
          const providerList = isImage ? IMAGE_PROVIDERS : PROVIDERS;
          const providerValue = isImage
            ? "openai"
            : config?.[role.providerKey] || "openai";
          const modelList = modelsForProvider(providerValue, {
            kind: isImage ? "image" : "chat",
            current: config?.[role.modelKey] || "",
          });
          const modelValue = config?.[role.modelKey] || modelList[0]?.value || "";

          return (
            <div
              key={role.id}
              className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#1d9c35] via-[#0EFF2A] to-transparent opacity-80" />
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#dff7de] text-[#1d9c35]">
                    <FiCpu className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{role.title}</p>
                    <p className="text-[11px] text-gray-500 truncate">{role.subtitle}</p>
                  </div>
                </div>
                {ok ? (
                  <FiCheckCircle className="h-4 w-4 text-[#1d9c35] shrink-0" title="Key ready" />
                ) : (
                  <FiAlertCircle className="h-4 w-4 text-amber-500 shrink-0" title="Missing key" />
                )}
              </div>

              <div className="mt-3 space-y-2">
                <div className="relative">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    Provider
                  </label>
                  <select
                    className={selectClass}
                    value={providerValue}
                    onChange={(e) => {
                      const nextProvider = e.target.value;
                      const nextModel = defaultModelForProvider(
                        nextProvider,
                        isImage ? "image" : "chat"
                      );
                      onPatchSite?.({
                        [role.providerKey]: nextProvider,
                        [role.modelKey]: nextModel,
                      });
                    }}
                  >
                    {providerList.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-2.5 bottom-2.5 h-3.5 w-3.5 text-gray-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    Model
                  </label>
                  <ModelCombobox
                    id={`post-roster-${role.id}`}
                    className={`${inputClass} mt-1 text-xs font-semibold`}
                    value={modelValue}
                    options={modelList}
                    onChange={(v) => onPatchSite?.({ [role.modelKey]: v })}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
