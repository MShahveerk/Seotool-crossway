"use client";

/**
 * Select-or-type model field: datalist suggestions + free-text model ids.
 */
export default function ModelCombobox({
  id,
  value = "",
  options = [],
  onChange,
  className = "",
  placeholder = "Select or type a model id",
}) {
  const listId = `${id || "model"}-datalist`;
  return (
    <div className="relative">
      <input
        type="text"
        list={listId}
        className={className}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id={listId}>
        {options.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label && m.label !== m.value ? m.label : undefined}
          </option>
        ))}
      </datalist>
    </div>
  );
}
