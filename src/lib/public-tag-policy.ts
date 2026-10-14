/**
 * Imported catalogue noise which should never be presented as a public topic.
 * Keep this deliberately small and explicit: legitimate long-tail tags stay
 * available, while malformed/repeated-word records cannot waste crawl budget.
 */
export const EXCLUDED_PUBLIC_TAG_SLUGS = [
  "2015-nude-scenes-until",
  "until",
  "not",
  "videos",
  "classcic-nude-scene",
  "actress-video-video",
  "naked-naked-celeb",
  "naked-naked-sex",
  "naked-naked-celebs",
  "naked-sex-naked",
  "the-nude-nude",
  "margot-margot-robbie",
];

const excludedTagSlugs = new Set(EXCLUDED_PUBLIC_TAG_SLUGS);

export function isPublicTagSlug(slug: string) {
  return !excludedTagSlugs.has(slug.trim().toLowerCase());
}
