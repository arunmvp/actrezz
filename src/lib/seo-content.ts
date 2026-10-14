import type { Video } from "@/lib/youtube/data";

const INTENT_TERMS: Record<string, string[]> = {
  nude: ["nude", "naked"],
  topless: ["topless"],
  sex: ["sex scene"],
  sexy: ["sexy"],
  lingerie: ["lingerie", "underwear"],
  underwear: ["underwear"],
  bikini: ["bikini"],
  cleavage: ["cleavage"],
  breasts: ["breasts"],
  ass: ["ass"],
  shower: ["shower scene"],
};

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const titleCase = (value: string) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());

export function intentTerms(videos: Video[]) {
  const counts = new Map<string, number>();
  for (const video of videos) {
    for (const tag of video.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (INTENT_TERMS[key]) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .flatMap(([tag]) => INTENT_TERMS[tag])
    .filter((term, index, all) => all.indexOf(term) === index);
}

export function buildVideoSeo(video: Video, actressNames: string[]) {
  const names = unique(actressNames);
  const terms = intentTerms([video]);
  const primaryName = names[0] || "Actress";
  const primaryTerm = terms[0];
  const context = [video.workTitle, video.seasonNumber ? `Season ${video.seasonNumber}` : "", video.episodeNumber ? `Episode ${video.episodeNumber}` : "", video.year ? String(video.year) : ""].filter(Boolean).join(" · ");
  const title = `${primaryName}${primaryTerm ? ` ${titleCase(primaryTerm)}` : ""} Video${video.workTitle ? ` – ${video.workTitle}` : ""}${video.year ? ` (${video.year})` : ""}`;
  const description = `Watch ${names.join(", ") || primaryName}${primaryTerm ? ` in a ${primaryTerm} scene` : " in this video"}${video.workTitle ? ` from ${video.workTitle}` : ""}${video.year ? ` (${video.year})` : ""}. ${context ? `${context}. ` : ""}${(video.description || "View the complete scene and related catalogue details.").replace(/\s+/g, " ")}`.slice(0, 300);
  const keywords = unique([
    ...names.flatMap((name) => [
      `${name} video`,
      ...terms.flatMap((term) => [`${name} ${term}`, `${name} ${term} video`]),
    ]),
    video.workTitle ? `${primaryName} ${video.workTitle}` : "",
    video.workTitle ? `${video.workTitle} scene` : "",
    ...(video.seoKeywords ?? []),
  ]).slice(0, 30);
  return { title: title.slice(0, 95), description, keywords, terms };
}

export function buildActressSeo(name: string, videos: Video[]) {
  const terms = intentTerms(videos);
  const titleTerms = terms[0] ? titleCase(terms[0]) : "";
  const works = unique(videos.map((video) => video.workTitle ?? "")).slice(0, 4);
  const title = `${name}${titleTerms ? ` ${titleTerms}` : ""} Videos & Movie Scenes`;
  const description = `Browse ${videos.length} curated ${name} videos${terms.length ? ` including ${terms.slice(0, 4).join(", ")} scenes` : ""}${works.length ? ` from ${works.join(", ")}` : ""}. Explore related movies, TV series, years and tags.`;
  const keywords = unique([
    `${name} video`, `${name} videos`, `${name} movie scenes`, `${name} TV scenes`,
    ...terms.flatMap((term) => [`${name} ${term}`, `${name} ${term} video`]),
    ...works.map((work) => `${name} ${work}`),
  ]).slice(0, 30);
  return { title: title.slice(0, 95), description: description.slice(0, 300), keywords, terms, works };
}
