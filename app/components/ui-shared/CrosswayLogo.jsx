"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand mark that stays readable on light and dark chrome.
 * Light UI: black transparent mark → full logo tile if needed.
 * Dark UI: white mark → full logo tile if needed.
 */
export default function CrosswayLogo({
  variant = "light",
  size = 36,
  className,
  imgClassName,
  alt = "Crossway",
}) {
  const chain =
    variant === "dark"
      ? ["/crossway-logo-white.png", "/crossway-logo.png"]
      : ["/crossway-logo-black.png", "/crossway-logo.png"];
  const [idx, setIdx] = useState(0);
  const src = chain[Math.min(idx, chain.length - 1)];
  const onBlackTile = src === "/crossway-logo.png";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
        onBlackTile && "bg-black p-0.5",
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={cn("h-full w-full object-contain", imgClassName)}
        onError={() => {
          if (idx < chain.length - 1) setIdx((i) => i + 1);
        }}
      />
    </span>
  );
}
