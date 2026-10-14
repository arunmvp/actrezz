import { NextResponse } from "next/server";
import { jsonError, noStore, requireAdmin } from "@/lib/admin/catalog-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type MetadataPayload = {
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  tags: string[];
  provider: "openrouter" | "gemini" | "local";
};

type ShortTopics = { tags: string[]; keywords: string[] };

const GENERIC_SHORT_WORDS = /\b(?:clips?|shorts?(?:\s+clips?)?|trending|hot\s+reels?|adult\s+reels?|celebrity\s+short\s+video|adult\s+short\s+video|hot\s+shorts?\s+video)\b/gi;

/** Tags are taxonomy, not an SEO keyword dump. Only add a contextual tag when
 * the admin's own brief supports it. */
function curatedShortTopics(value: string, subjectType: "actress" | "random"): ShortTopics {
  const source = value.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(source);
  const tags: string[] = [];

  if (has(/\bsex(?:ual)?\b|\bsex\s*scene\b/)) tags.push("sex scene");
  if (has(/\bnud[ei]|\bnaked\b|\btopless\b/)) tags.push("nude scene");
  if (has(/\bbikini\b/)) tags.push("bikini");
  if (has(/\blingerie\b|\bunderwear\b/)) tags.push("lingerie");
  if (has(/\bred\s*carpet\b|\bpremiere\b/)) tags.push("red carpet");
  if (has(/\binterview\b/)) tags.push("interview");

  const cleaned = uniq(tags).slice(0, subjectType === "random" ? 3 : 4);
  return { tags: cleaned, keywords: cleaned };
}

function cleanText(value: unknown, max = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

function compactPhrase(value: unknown, max = 40) {
  const text = cleanText(value, Math.max(max + 20, 80));
  if (text.length <= max) return text;
  const clipped = text.slice(0, max + 1).replace(/\s+\S*$/, "").trim();
  return clipped || text.slice(0, max).trim();
}

function uniq(items: string[]) {
  const seen = new Set<string>();
  return items
    .map((item) => compactPhrase(item, 40).toLowerCase())
    .filter((item) => item.length >= 2)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function titleWords(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function removeGenericShortWords(value: unknown) {
  return cleanText(value, 160)
    .replace(GENERIC_SHORT_WORDS, " ")
    .replace(/\bvertical\s+video\b/gi, " ")
    .replace(/\s+([,.:;!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.:;!-]+|[\s,.:;!-]+$/g, "")
    .trim();
}

function normalizeAdultWording(value: unknown) {
  return removeGenericShortWords(value)
    .replace(/\b(?:young|teen(?:age)?|underage)\s+(?:girl|woman|female)\b/gi, "adult woman")
    .replace(/\byoung\s+girl\b/gi, "adult woman")
    .replace(/\bhot\s+butts?\b/gi, "hot butt video")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hasIntent(value: string, term: "hot" | "sexy") {
  return new RegExp(`\\b${term}\\b`, "i").test(value);
}

function safeJson(text: string) {
  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch {
    const match = direct.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function shortTitle(value: unknown, people: string[], subjectType: "actress" | "random") {
  let title = removeGenericShortWords(value)
    .replace(/\s*\|\s*Actrezz(?:\s+Shorts)?\s*$/i, "")
    .trim();
  const subject = people[0] || "Woman";
  if (!title) title = `${subject} Video`;
  if (subjectType === "actress" && people[0] && !title.toLowerCase().startsWith(people[0].toLowerCase())) {
    title = `${people[0]} ${title}`;
  }
  if (subjectType === "random" && !/\b(woman|girl|model|performer|person)\b/i.test(title)) {
    title = `Woman ${title}`;
  }
  return cleanText(title, 90);
}

function focusedKeywords(people: string[], source: string, subjectType: "actress" | "random") {
  const topics = curatedShortTopics(source, subjectType);
  const subject = people[0] || (subjectType === "random" ? "woman" : "celebrity");
  const keywords = [
    ...people,
    `${subject} video`,
    ...(hasIntent(source, "hot") ? [`${subject} hot video`] : []),
    ...(hasIntent(source, "sexy") ? [`${subject} sexy video`] : []),
    ...(/\bbutts?\b/i.test(source) ? [`${subject} hot butt video`] : []),
    ...topics.keywords.map((topic) => `${subject} ${topic} video`),
  ];
  return uniq(keywords.map(removeGenericShortWords)).slice(0, 7);
}

function focusedDescription(subject: string, detail: string) {
  const meaningfulDetail = normalizeAdultWording(detail)
    .replace(new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-:–—]?\\s*`, "i"), "")
    .trim();
  const displaySubject = subject === "Adult Woman" ? "an adult woman" : subject;
  const lead = !meaningfulDetail || /^(?:video|hot video|sexy video|hot butt video)$/i.test(meaningfulDetail)
    ? `Watch ${displaySubject} in this ${meaningfulDetail || "video"}.`
    : `Watch ${displaySubject} in ${meaningfulDetail}.`;
  const followUp = subject === "Adult Woman"
    ? "Browse related adult video scenes on Actrezz."
    : `Explore more ${subject} videos and related actress scenes on Actrezz.`;
  return cleanText(`${lead} ${followUp}`, 280);
}

function normalize(
  payload: Partial<MetadataPayload>,
  fallback: MetadataPayload["provider"],
  input: { brief: string; twitterTitle?: string; twitterDescription?: string; actresses: string[]; subjectType?: "actress" | "random" },
): MetadataPayload {
  const local = localMetadata(input.brief, input.actresses, input.twitterTitle, input.subjectType, input.twitterDescription);
  const people = input.actresses.map((name) => cleanText(name, 60)).filter(Boolean);
  const subjectType = input.subjectType === "random" ? "random" : "actress";
  const source = normalizeAdultWording([input.brief, input.twitterTitle, input.twitterDescription].filter(Boolean).join(" "));
  const topics = curatedShortTopics(source, subjectType);
  const title = shortTitle(payload.title || local.title, people, subjectType);
  const subject = people[0] || (subjectType === "random" ? "Adult Woman" : "Celebrity");
  const description = focusedDescription(subject, input.brief || input.twitterTitle || title);
  const seoTitle = shortTitle(payload.seoTitle || title, people, subjectType);
  const seoDescription = description;
  const tags = uniq([...people, ...topics.tags]).slice(0, 12);
  const seoKeywords = focusedKeywords(people, source, subjectType);
  return { title, description, seoTitle, seoDescription, seoKeywords, tags, provider: fallback };
}

function localMetadata(brief: string, actresses: string[], twitterTitle?: string, subjectType: "actress" | "random" = "actress", twitterDescription?: string): MetadataPayload {
  const people = actresses.map((name) => cleanText(name, 60)).filter(Boolean);
  const seed = normalizeAdultWording(brief || twitterTitle || "New celebrity video");
  const seedWithoutName = people.reduce((value, name) => value.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), ""), seed).replace(/^\s*[-:–—]\s*|\s+/g, " ").trim();
  const subject = people[0] || (subjectType === "random" ? "Adult Woman" : "Celebrity");
  const detail = seedWithoutName && !/^new celebrity (?:short|video)$/i.test(seedWithoutName)
    ? seedWithoutName.replace(/^adult woman\s*[-:–—]?\s*/i, "").trim()
    : "Video";
  const title = shortTitle(`${subject} ${titleWords(detail)}`, people, subjectType);
  const description = focusedDescription(subject, detail);
  const source = normalizeAdultWording([brief, twitterTitle, twitterDescription].filter(Boolean).join(" "));
  const topics = curatedShortTopics(source, subjectType);
  const tags = uniq([...people, ...topics.tags]).slice(0, 12);
  const seoKeywords = focusedKeywords(people, source, subjectType);
  return {
    title,
    description,
    seoTitle: cleanText(title, 95),
    seoDescription: cleanText(description, 280),
    seoKeywords,
    tags,
    provider: "local",
  };
}

function buildPrompt(input: { brief: string; twitterTitle?: string; twitterDescription?: string; actresses: string[]; subjectType: "actress" | "random" }) {
  return [
    "Create unique, search-friendly metadata for an admin-provided video.",
    "Only use facts supplied by the admin. Do not invent names, movies, dates, or explicit acts.",
    "Assume all people are adults and consenting; avoid terms implying minors, coercion, private leaks, or non-consensual content.",
    "Return JSON only with keys: title, description, seoTitle, seoDescription, seoKeywords, tags.",
    input.subjectType === "random"
      ? "The person is an unidentified adult woman. Never invent a name. Title the visible moment naturally."
      : "Title format: actress name + the specific visible moment from the brief. Make it readable, not a keyword list.",
    input.subjectType === "random"
      ? "SEO title must not imply a celebrity identity. Use only relevant intent words supported by the brief."
      : "SEO title must lead with the actress name and include only relevant intent words supported by the brief, such as sexy, bikini, interview, premiere, fashion or scene.",
    "Write a unique factual description in one or two sentences. Do not use any of these filler phrases in title, description, keywords or tags: clip, clips, short, shorts, trending, reels, hot reels, adult reels.",
    "Return 3-7 focused SEO keywords. For a known actress, include her name, her name + video, and only intent or context explicitly supplied by the admin. Tags are existing taxonomy only: actress name and genuinely supported context such as bikini, lingerie, red carpet, interview or scene. Never create generic format tags.",
    "Keep title under 80 chars, seoTitle under 90 chars, seoDescription under 260 chars. Do not add an Actrezz suffix; the website adds it.",
    `Actresses: ${input.actresses.join(", ") || "not selected"}`,
    `Subject type: ${input.subjectType === "random" ? "unidentified adult woman" : "known actress"}`,
    `Admin brief: ${input.brief}`,
    `Twitter title: ${input.twitterTitle || ""}`,
    `Twitter description: ${input.twitterDescription || ""}`,
  ].join("\n");
}

async function askOpenRouter(prompt: string) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://actrezz.online",
      "X-Title": "Actrezz Admin",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.35,
      max_tokens: 900,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(18_000),
  });
  if (!response.ok) throw new Error(`OpenRouter failed (${response.status})`);
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ? safeJson(data.choices[0].message.content) : null;
}

async function askGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 900,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          required: ["title", "description", "seoTitle", "seoDescription", "seoKeywords", "tags"],
          properties: {
            title: { type: "STRING" },
            description: { type: "STRING" },
            seoTitle: { type: "STRING" },
            seoDescription: { type: "STRING" },
            seoKeywords: { type: "ARRAY", items: { type: "STRING" } },
            tags: { type: "ARRAY", items: { type: "STRING" } },
          },
        },
      },
    }),
    signal: AbortSignal.timeout(18_000),
  });
  if (!response.ok) throw new Error(`Gemini failed (${response.status})`);
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
  return text ? safeJson(text) : null;
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return jsonError("Unauthorized.", 401);
  const body = (await request.json().catch(() => null)) as { brief?: string; twitterTitle?: string; twitterDescription?: string; actresses?: string[]; subjectType?: "actress" | "random" } | null;
  const brief = cleanText(body?.brief, 500);
  const twitterTitle = cleanText(body?.twitterTitle, 180);
  const twitterDescription = cleanText(body?.twitterDescription, 500);
  const actresses = Array.isArray(body?.actresses) ? body.actresses.map((name) => cleanText(name, 80)).filter(Boolean).slice(0, 6) : [];
  const subjectType = body?.subjectType === "random" ? "random" : "actress";
  if (!brief && !twitterTitle && actresses.length === 0) return jsonError("Add a one-line short brief or choose an actress first.");

  const prompt = buildPrompt({ brief, twitterTitle, twitterDescription, actresses, subjectType });
  try {
    const openrouter = await askOpenRouter(prompt);
    if (openrouter) return noStore(NextResponse.json(normalize(openrouter, "openrouter", { brief, twitterTitle, actresses, subjectType })));
  } catch {
    // Fall back to Gemini/local metadata.
  }
  try {
    const gemini = await askGemini(prompt);
    if (gemini) return noStore(NextResponse.json(normalize(gemini, "gemini", { brief, twitterTitle, actresses, subjectType })));
  } catch {
    // Fall back to local metadata.
  }
  return noStore(NextResponse.json(localMetadata(brief, actresses, twitterTitle, subjectType)));
}
