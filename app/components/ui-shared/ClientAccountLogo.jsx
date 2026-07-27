"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import { getClientAccountFaviconUrl } from "@/lib/clientAccountList";
import { cn } from "@/lib/utils";

export default function ClientAccountLogo({ entry, className, size = "md" }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const favicon = getClientAccountFaviconUrl(entry?.siteLink);
  const hasFb = Boolean(entry?.facebookPageId);
  const sizePx = size === "sm" ? 16 : 20;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: sizePx, height: sizePx }}
    >
      {favicon && !faviconFailed ? (
        <img
          src={favicon}
          alt=""
          width={sizePx}
          height={sizePx}
          className="rounded-sm object-contain"
          onError={() => setFaviconFailed(true)}
        />
      ) : hasFb ? (
        <SiFacebook className="size-full text-[#1877F2]" aria-hidden />
      ) : (
        <Globe className="size-full text-muted-foreground" aria-hidden />
      )}
      {hasFb && favicon && !faviconFailed ? (
        <SiFacebook
          className="absolute -bottom-0.5 -right-1 size-2.5 rounded-full bg-background text-[#1877F2] ring-1 ring-background"
          aria-hidden
        />
      ) : null}
    </span>
  );
}
