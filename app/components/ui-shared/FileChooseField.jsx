"use client";

import { useId, useRef } from "react";
import { FiImage } from "react-icons/fi";
import { cn } from "@/lib/utils";

export default function FileChooseField({
  accept,
  file,
  onFileChange,
  label = "Choose file",
  chooseLabel,
  hint = "Click to select a file.",
  required = false,
  id: idProp,
  className,
  icon: Icon = FiImage,
}) {
  const autoId = useId();
  const id = idProp || `file-${autoId.replace(/:/g, "")}`;
  const inputRef = useRef(null);

  const clear = () => {
    onFileChange?.(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("space-y-1", className)}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        required={required}
        className="sr-only"
        onChange={(e) => onFileChange?.(e.target.files?.[0] || null)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus-within:outline-none focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-2"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {chooseLabel || (file ? "Choose replacement" : label)}
        </label>
        {file ? (
          <>
            <span className="max-w-48 truncate text-sm text-gray-700 sm:max-w-xs" title={file.name}>
              {file.name}
            </span>
            <button
              type="button"
              className="text-sm font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
              onClick={clear}
            >
              Remove
            </button>
          </>
        ) : hint ? (
          <span className="text-sm text-gray-500">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}
