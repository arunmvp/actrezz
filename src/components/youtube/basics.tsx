"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  initials: string;
  color: string;
  imgSrc?: string;
  size?: number;
  className?: string;
  ring?: boolean;
}

/** Channel avatar with initials fallback + optional photo overlay */
export function Avatar({
  initials,
  color,
  imgSrc,
  size = 36,
  className,
  ring,
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageSrc = imgSrc && !imgFailed ? imgSrc : "/images/actress-placeholder.jpg";
  const isPlaceholder = imageSrc === "/images/actress-placeholder.jpg";
  const style: React.CSSProperties = {
    width: size,
    height: size,
    background: color,
    fontSize: Math.max(10, size * 0.4),
  };
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium text-white",
        ring && "ring-2 ring-yt-red ring-offset-2 ring-offset-yt-bg",
        className
      )}
      style={style}
      aria-hidden="true"
    >
      <img
        src={imageSrc}
        alt=""
        className={cn("h-full w-full object-cover", isPlaceholder && "scale-[1.16]")}
        loading="lazy"
        onError={() => { if (!isPlaceholder) setImgFailed(true); }}
      />
    </span>
  );
}

/** Reusable circular icon button used across the UI */
export function IconButton({
  children,
  label,
  onClick,
  className,
  active,
  size = 40,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  active?: boolean;
  size?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-yt-text transition-colors duration-100 hover:bg-yt-hover active:bg-yt-overlay",
        active && "bg-yt-hover",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Thumbnails with gradient fallback + duration badge */
export function Thumb({
  seed,
  src,
  className,
  radius = "rounded-xl",
  children,
}: {
  seed: string;
  src?: string;
  className?: string;
  radius?: string;
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const hue = [...seed].reduce((a, c) => a + c.charCodeAt(0), 7) % 360;
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-yt-skeleton",
        radius,
        className
      )}
      style={
        failed
          ? {
              background: `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 55% 18%))`,
            }
          : undefined
      }
    >
      {!failed && (
        <img
          src={src || `https://picsum.photos/seed/${seed}/640/360`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {children}
    </div>
  );
}
