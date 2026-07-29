export const INTERVAL_OPTIONS = [
  { value: 60, label: "Every hour" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Every day" },
  { value: 2880, label: "Every 2 days" },
  { value: 10080, label: "Every week" },
];

export const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
];

export const AGENT_ROLES = [
  {
    id: "interpreter",
    title: "Interpreter",
    subtitle: "Document → SEO seeds",
    providerKey: "interpreterProvider",
    modelKey: "interpreterModel",
    readyKey: "interpreter",
  },
  {
    id: "agent1",
    title: "Strategist",
    subtitle: "Keyword intelligence",
    providerKey: "agent1Provider",
    modelKey: "agent1Model",
    readyKey: "agent1",
  },
  {
    id: "agent2",
    title: "Architect",
    subtitle: "Article blueprint",
    providerKey: "agent2Provider",
    modelKey: "agent2Model",
    readyKey: "agent2",
  },
  {
    id: "agent3",
    title: "Writer",
    subtitle: "Publication draft",
    providerKey: "agent3Provider",
    modelKey: "agent3Model",
    readyKey: "agent3",
  },
  {
    id: "image",
    title: "Image",
    subtitle: "Featured visual",
    providerKey: "imageProvider",
    modelKey: "imageModel",
    readyKey: "image",
  },
];

export const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1d9c35]/30 focus:border-[#1d9c35]";

export const labelClass = "text-xs font-semibold uppercase tracking-wide text-gray-500";

export function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `$${Number(n).toFixed(4)}`;
}

export function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function statusTone(status) {
  switch (String(status || "")) {
    case "succeeded":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "failed":
      return "bg-red-50 text-red-700 border-red-200";
    case "running":
    case "queued":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "cancelled":
      return "bg-gray-100 text-gray-600 border-gray-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}
