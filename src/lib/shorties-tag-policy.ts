/**
 * Curated Shorties topic pages. These are the import tags that passed the
 * local quality review: allowed subject matter, at least two source videos,
 * and enough supporting metadata to be a useful landing page. Keeping this
 * explicit prevents thin or review-needed import labels from consuming crawl
 * budget just because they happen to have one associated clip.
 */
export const SHORTIES_SEO_TAG_SLUGS = [
  "3d", "69-position", "amateur", "anal", "asian", "babes", "bathhouse",
  "bathroom", "bbc", "bbw", "bdsm", "beach", "beautiful-tits", "bed",
  "big-ass", "big-clit", "big-dick", "big-tits", "bikini", "blindfold",
  "blonde", "blowjob", "bondage", "brunette", "car", "casual-sex",
  "caucasian", "celebrity", "cheating", "close-up", "club", "compilation",
  "cosplay", "country", "creampie", "cuckold", "cum", "cum-swallowing",
  "cumshots", "dancing", "deepthroat", "dildo", "dirty-talk", "doggy-style",
  "double-penetration", "dress", "dressed", "ebony", "emo", "ex-girlfriend",
  "facesitting", "facial", "female-masturbation", "femdom", "fetish", "ffm",
  "fingering", "fisting", "flashing", "foot-fetish", "footjob", "friends",
  "fucking-machines", "gangbang", "gaping", "glamour", "glasses", "gothic",
  "grannies", "group-sex", "hairy-pussy", "handcuffs", "hd-videos", "high-heels",
  "homemade", "husband-and-wife", "indian", "interracial", "japanese", "jerk-off",
  "kissing", "kitchen", "latex", "latina", "lingerie", "mask", "mature", "milf",
  "mmf", "moaning", "mulata", "music-videos", "my-personal-man", "my-personal-women",
  "natural-tits", "neighbor", "nipples", "nudist", "nylon", "object-insertion",
  "office", "old-man", "oral-sex", "orgasms", "outdoor", "panties", "pantyhose",
  "piercing", "pissing", "pornstar", "pov", "pregnant", "public", "pussy",
  "pussy-licking", "redhead", "rimjob", "romantic", "rough-sex", "russian",
  "saggy-tits", "seduction", "selfie", "sensual", "sex-positions", "sex-toys",
  "sexy-costume", "shaved-pussy", "showers", "skinny", "skirt", "small-dick",
  "small-tits", "softcore", "spanking", "sports", "squirt", "stockings", "strapon",
  "street", "striptease", "submission", "table", "talking", "tattoos", "threesome",
  "titty-fuck", "toilet", "train", "ukrainian", "upskirt", "vibrator", "water",
  "webcam", "whipping", "whore", "wife",
] as const;

const shortiesSeoTagSlugs = new Set<string>(SHORTIES_SEO_TAG_SLUGS);

export function isShortiesSeoTagSlug(slug: string) {
  return shortiesSeoTagSlugs.has(slug.trim().toLowerCase());
}
