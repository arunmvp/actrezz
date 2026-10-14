import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  serverExternalPackages: ["@prisma/client", ".prisma/client", "pg", "pg-cloudflare"],
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  async headers() {
    const publicCache = { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" };
    const publicPages = ["/", "/actresses", "/movies", "/tv-series", "/tags", "/years", "/trending", "/shorts", "/shorts/:path*", "/about", "/privacy", "/copyright", "/dmca", "/terms", "/watch/:path*", "/actress/:path*", "/movie/:path*", "/tv-series/:path*", "/tag/:path*", "/year/:path*"];
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      ...publicPages.map((source) => ({ source, headers: [publicCache] })),
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] },
    ];
  },
};

export default nextConfig;
