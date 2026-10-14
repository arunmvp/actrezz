import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { GoToTop, TopLoader } from "@/components/site-enhancements";
import { AgeConfirmation } from "@/components/public/AgeConfirmation";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online"),
  title: { default: "Actrezz — Actress nude scenes & celebrity videos", template: "%s | Actrezz" },
  description:
    "Watch curated actress nude scenes, celebrity sex scenes, topless movie clips and TV series adult videos by actress, movie, tag and year.",
  keywords: [
    "actress nude scenes",
    "celebrity nude videos",
    "celebrity sex scenes",
    "actress porn videos",
    "actress topless scenes",
    "movie nude scenes",
    "tv series nude scenes",
    "hot actress videos",
    "naked celebrity scenes",
    "adult celebrity video catalogue",
    "Actrezz",
  ],
  applicationName: "Actrezz",
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Actrezz",
    title: "Actrezz — Actress nude scenes & celebrity videos",
    description: "Browse curated actress nude scenes, celebrity sex scenes, topless movie clips and adult TV series videos.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Actrezz — Actress nude scenes & celebrity videos",
    description: "Curated actress nude scenes, celebrity sex scenes and adult movie/TV video catalogue.",
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 } },
  verification: {
    other: {
      "naver-site-verification": "98dd3b2d53f503faebf55c2617e1a33f620266f3",
      "6a97888e-site-verification": "c76ed8e0c30ec0cc21472d0f740cd5d2",
    },
  },
  other: { rating: "adult" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{if(location.hostname==="localhost"||location.hostname==="127.0.0.1"||new URLSearchParams(location.search).has("debug_console"))return;const c=window.console;if(!c)return;for(const m of["log","info","debug","warn","error","trace","table"])c[m]=()=>{};}catch{}})();`,
          }}
        />
        <link rel="preconnect" href="https://media.actrezz.online" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://media.actrezz.online" />
        {/* Ads are not render-critical on catalogue pages. Reserve full
            connection setup for the thumbnail origin that determines LCP. */}
        <link rel="dns-prefetch" href="https://imasdk.googleapis.com" />
        <link rel="dns-prefetch" href="https://s.magsrv.com" />
        <link rel="dns-prefetch" href="https://s.pemsrv.com" />
        <meta httpEquiv="Delegate-CH" content="Sec-CH-UA https://s.magsrv.com; Sec-CH-UA-Mobile https://s.magsrv.com; Sec-CH-UA-Arch https://s.magsrv.com; Sec-CH-UA-Model https://s.magsrv.com; Sec-CH-UA-Platform https://s.magsrv.com; Sec-CH-UA-Platform-Version https://s.magsrv.com; Sec-CH-UA-Bitness https://s.magsrv.com; Sec-CH-UA-Full-Version-List https://s.magsrv.com; Sec-CH-UA-Full-Version https://s.magsrv.com;" />
        <meta httpEquiv="Delegate-CH" content="Sec-CH-UA https://s.pemsrv.com; Sec-CH-UA-Mobile https://s.pemsrv.com; Sec-CH-UA-Arch https://s.pemsrv.com; Sec-CH-UA-Model https://s.pemsrv.com; Sec-CH-UA-Platform https://s.pemsrv.com; Sec-CH-UA-Platform-Version https://s.pemsrv.com; Sec-CH-UA-Bitness https://s.pemsrv.com; Sec-CH-UA-Full-Version-List https://s.pemsrv.com; Sec-CH-UA-Full-Version https://s.pemsrv.com;" />
      </head>
      <body className="font-sans antialiased bg-yt-bg text-yt-text">
        <ThemeProvider
          defaultTheme="dark"
        >
          <AgeConfirmation />
          {children}
          <TopLoader />
          <GoToTop />
          <Toaster position="bottom-left" />
        </ThemeProvider>
      </body>
    </html>
  );
}
