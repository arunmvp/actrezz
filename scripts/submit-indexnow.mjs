import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online").replace(/\/+$/, "");
const host = new URL(siteUrl).hostname;
const key = process.env.INDEXNOW_KEY || "9a8614f67048482baf077b1df307f6e5";
const keyLocation = `${siteUrl}/${key}.txt`;
const endpoints = [
  ["indexnow", "https://api.indexnow.org/indexnow", true],
  ["bing", "https://www.bing.com/indexnow", true],
  ["yandex", "https://yandex.com/indexnow", true],
  ["naver", "https://searchadvisor.naver.com/indexnow", true],
  ["seznam", "https://search.seznam.cz/indexnow", false],
  ["yep", "https://indexnow.yep.com/indexnow", true],
];
const sitemapUrls = [`${siteUrl}/sitemap.xml`, `${siteUrl}/video-sitemap.xml`];
const dryRun = process.argv.includes("--dry-run");
const engineArg = process.argv.find((arg) => arg.startsWith("--engine="));
const selectedEngine = engineArg?.split("=")[1]?.trim().toLowerCase();
const selectedEndpoints = selectedEngine ? endpoints.filter(([name]) => name === selectedEngine) : endpoints;
const batchSize = 10_000;

if (selectedEngine && selectedEndpoints.length === 0) {
  throw new Error(`Unknown IndexNow engine "${selectedEngine}". Available: ${endpoints.map(([name]) => name).join(", ")}`);
}

async function fetchSitemap(url) {
  const response = await fetch(url, {
    headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.8", "user-agent": "Actrezz-IndexNow/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Sitemap ${url} returned HTTP ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

async function submit(endpoint, urlList, sendKeyLocation) {
  const payload = { host, key, urlList };
  if (sendKeyLocation) payload.keyLocation = keyLocation;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", accept: "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`IndexNow returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  return { status: response.status, body: body.slice(0, 500) };
}

async function main() {
  const sitemapEntries = (await Promise.all(sitemapUrls.map(fetchSitemap))).flat();
  const urls = [...new Set(sitemapEntries)].filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === host;
    } catch {
      return false;
    }
  });

  console.log(`IndexNow host: ${host}`);
  console.log(`Key location: ${keyLocation}`);
  console.log(`Engines: ${selectedEndpoints.map(([name]) => name).join(", ")}`);
  console.log(`Discovered ${urls.length} unique URLs from ${sitemapUrls.length} sitemaps.`);
  if (dryRun) {
    console.log("Dry run; no URLs submitted.");
    return;
  }

  for (const [engineName, endpoint, sendKeyLocation] of selectedEndpoints) {
    for (let offset = 0; offset < urls.length; offset += batchSize) {
      const batch = urls.slice(offset, offset + batchSize);
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const result = await submit(endpoint, batch, sendKeyLocation);
          console.log(
            `${engineName}: submitted ${offset + 1}-${offset + batch.length}/${urls.length} (HTTP ${result.status}).`,
          );
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        }
      }
      if (lastError) throw new Error(`${engineName}: ${lastError.message}`);
    }
  }
  console.log("IndexNow submission complete. Indexing is not guaranteed; monitor Bing Webmaster Tools.");
}

main().catch((error) => {
  console.error(`IndexNow submission failed: ${error.message}`);
  process.exitCode = 1;
});
