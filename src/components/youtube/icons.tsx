"use client";

/* Brand icons drawn as inline SVG (original artwork, YouTube-inspired styling) */

export function LogoMark({ className = "h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 108 22" className={className} role="img" aria-label="Actrezz">
      <defs><linearGradient id="actrezz-gradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ff2d78" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient></defs>
      <rect x="1" y="1" width="20" height="20" rx="6" fill="url(#actrezz-gradient)" />
      <path d="M5.2 16.8 10 5.5h2.4l4.9 11.3h-3.1l-.8-2H9l-.8 2h-3Zm4.8-4.6h2.4l-1.2-3.1-1.2 3.1Z" fill="#fff" />
      <path d="m13.2 8.4 4.3 2.7-4.3 2.7Z" fill="#fff" />
      <text
        x="27"
        y="16.5"
        fill="currentColor"
        fontSize="17"
        fontWeight="800"
        fontFamily="Roboto, Arial, sans-serif"
        letterSpacing="-0.7"
      >
        actrezz
      </text>
    </svg>
  );
}

export function VerifiedBadge({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Verified">
      <path d="M12 2 9.8 4.2 6.7 3.8 5.6 6.7 2.5 8.4 3.4 11.4 2.2 14.2 5 15.9 5.7 19 8.8 18.7 11.4 20.6 13.5 18.3 16.6 18.7 17.7 15.7 20.7 14 19.7 11 20.7 8.2 17.9 6.5 17.2 3.4 14 3.7 11.4 1.8 9.4 4.1 6.3 3.7 5.2 6.7 2.3 8.4 3.2 11.4 2.2 14.2 5 15.9 5.7 19 8.8 18.7 11.4 20.6" opacity="0" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2Zm-1.2 14.4-4-4 1.4-1.4 2.6 2.6 6-6L14.3 9l-3.5 7.4Z" transform="scale(0.95) translate(0.6,0.6)" />
    </svg>
  );
}

export function ShortsLogo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs><linearGradient id="actrezz-shorts-gradient" x1="5" y1="3" x2="27" y2="29" gradientUnits="userSpaceOnUse"><stop stopColor="#ff2d78"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
      <path d="M12.2 2.8h10.1a5.7 5.7 0 0 1 5.7 5.7v8.2L19.8 12 9.2 18.2A5.8 5.8 0 0 1 12.2 2.8Z" fill="url(#actrezz-shorts-gradient)"/>
      <path d="M19.8 29.2H9.7A5.7  5.7 0 0 1 4 23.5v-8.2l8.2 4.7 10.6-6.2a5.8 5.8 0 0 1-3 15.4Z" fill="url(#actrezz-shorts-gradient)"/>
      <path d="m13.1 10.3 8.7 5.7-8.7 5.7V10.3Z" fill="#fff"/>
    </svg>
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-[#ff0000] px-1 py-[1px] text-[11px] font-medium uppercase text-white">
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      Live
    </span>
  );
}

export function CommentAuthorBadge() {
  return (
    <span className="ml-1 rounded-full bg-[#3ea6ff]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#3ea6ff]">
      Creator
    </span>
  );
}
