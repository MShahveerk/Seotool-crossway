"use client";

import { FiCheckCircle, FiAlertCircle, FiCpu } from "react-icons/fi";
import { AGENT_ROLES } from "./studioConstants";

export default function AgentRoster({ config }) {
  const ready = config?.agentReady || {};

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {AGENT_ROLES.map((role, i) => {
        const ok = Boolean(ready[role.readyKey]);
        const provider = config?.[role.providerKey] || "—";
        const model = config?.[role.modelKey] || "—";
        return (
          <div
            key={role.id}
            className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-transform duration-300 hover:-translate-y-0.5"
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
            <p className="mt-2 text-[11px] font-mono text-gray-600 truncate">
              {provider} · {model}
            </p>
          </div>
        );
      })}
    </div>
  );
}
