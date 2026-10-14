"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const PLACEHOLDER_IMAGE = "/images/actress-placeholder.jpg";

export function ProfileImage({
  src,
  alt,
  initials,
  color,
  className,
  loading = "lazy",
}: {
  src?: string;
  alt: string;
  initials: string;
  color: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  const [failed, setFailed] = useState(false);
  const imageSrc = src && !failed ? src : PLACEHOLDER_IMAGE;
  const isPlaceholder = imageSrc === PLACEHOLDER_IMAGE;
  return (
    <span
      className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white", className)}
      style={{ background: color }}
    >
      <img
        src={imageSrc}
        alt={isPlaceholder ? "" : alt}
        loading={loading}
        onError={() => { if (!isPlaceholder) setFailed(true); }}
        className={cn("h-full w-full object-cover", isPlaceholder && "scale-[1.16]")}
      />
    </span>
  );
}
