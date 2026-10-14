export function parsePageParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}
