export async function GET() {
  // This former discovery feed contained generic imported Shorties. A 410
  // retires it cleanly for crawlers that still have the old sitemap URL.
  return new Response(null, {
    status: 410,
    headers: { "X-Robots-Tag": "noindex, follow", "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
