"use client";

/**
 * In-app decline control: a yes/no ask, not a checkbox.
 * Yes is selected by default. Hidden entirely when the item cannot be
 * rewritten by Automation Studio.
 */
export default function DeclineStudioAsk({ enabled, value, onChange }) {
  if (!enabled) return null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm font-semibold text-gray-900">
        Ask Automation Studio to make the corrections needed?
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Your reason is recorded either way. Choose Yes if the studio should rewrite from this feedback.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={value === true}
          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
            value
              ? "border-gray-900 bg-gray-900 text-white shadow-sm"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={value === false}
          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
            !value
              ? "border-gray-900 bg-gray-900 text-white shadow-sm"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}
