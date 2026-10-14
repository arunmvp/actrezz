# Cloudflare cache and crawler policy

The workers.dev test deployment uses an R2 incremental cache bucket and five-minute application cache. Public pages and metadata are cacheable; admin and upload routes are no-store. R2 video delivery is direct, so video bytes do not pass through the Worker.

Production domain setup for `actrezz.online`:

1. Run `npm run cf:deploy` from the project folder. The deploy helper creates or checks the Cloudflare zone, builds with `https://actrezz.online` as the canonical site URL, and binds the Worker to `actrezz.online` plus `www.actrezz.online`.
2. If Cloudflare returns nameservers in `docs/DEPLOYMENT-INFO.json`, set those two nameservers at the domain seller/registrar. This is the only step that usually cannot be completed from the project unless the domain was bought inside Cloudflare.
3. After nameservers become active, attach `media.actrezz.online` as the R2 custom domain and set `NEXT_PUBLIC_MEDIA_URL=https://media.actrezz.online`. Until then, the public R2 URL is safe for testing.

Cache `/_next/static/*`, `/thumbnails/*`, and `/actresses/*` for one year; cache public HTML and sitemaps for five minutes with stale-while-revalidate; bypass admin, upload and signed media routes. Keep Range support enabled for video objects.

In Security > Bots, enable Cloudflare's AI crawlers block while keeping verified Googlebot, Bingbot, YandexBot and NaverBot allowed. The app also has a user-agent fallback and robots rules. Keep `SITE_INDEXING_ENABLED=false` on workers.dev; set it to `true` only after the real HTTPS canonical domain and Search Console property are ready.

Workers Free allows 100,000 requests/day. Cache hits still count as Worker requests, although they avoid Worker CPU. Cache lowers database work and latency but cannot guarantee staying below the request quota; monitor Workers Analytics and block unwanted traffic before it reaches the Worker.
