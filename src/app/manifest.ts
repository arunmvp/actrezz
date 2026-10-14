import type { MetadataRoute } from "next";

// This route has no runtime data.  Emit it as a static asset so PWA clients do
// not invoke the public application Worker for every manifest request.
export const dynamic = "force-static";
export const revalidate = false;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Actrezz",
    short_name: "Actrezz",
    description: "Actress nude scenes and celebrity adult video catalogue",
    start_url: "/",
    display: "standalone",
    background_color: "#0f0f0f",
    theme_color: "#0f0f0f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
