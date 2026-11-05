/**
 * Payer name checks (BUILD_SPEC 4.6). Exact matches (case-insensitive) are blocked; near
 * matches only warn, because two genuinely different licensees can have similar names.
 * Pure functions, safe to import in client components.
 */

/** Words that don't distinguish one company from another. */
const NOISE_WORDS = new Set([
  "limited",
  "ltd",
  "plc",
  "nigeria",
  "nig",
  "company",
  "co",
  "inc",
  "incorporated",
  "llc",
  "the",
  "and",
  "of",
]);

/** Lower case, punctuation to spaces, collapse whitespace. "CCETC Taihu Ltd." -> "ccetc taihu ltd" */
export function cleanName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The distinguishing words of a name, without noise words like "Limited" or "Nigeria". */
export function nameTokens(name: string): string[] {
  const words = cleanName(name).split(" ").filter(Boolean);
  const meaningful = words.filter((w) => !NOISE_WORDS.has(w));
  // A name made only of noise words ("The Company Ltd") keeps its words.
  return meaningful.length > 0 ? meaningful : words;
}

/** The comparison key: distinguishing words with the spaces removed. */
export function normaliseName(name: string): string {
  return nameTokens(name).join("");
}

/** Exact duplicate: the same name ignoring case and surrounding spaces. The database enforces this too. */
export function isSameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function levenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export type NearMatchReason = "same-words" | "contains" | "spelling";

/**
 * Why two names look like the same payer, or null if they don't.
 * - same-words: identical once case, punctuation and words like "Limited" are ignored
 *   ("Green Power Distribution Company" vs "GREEN POWER DISTRIBUTION NIGERIA LIMITED");
 * - contains: every distinguishing word of the shorter name (at least two words) appears
 *   in the longer one ("CCETC TAIHU" vs "CCETC Taihu Distribution");
 * - spelling: one or two letters apart ("Electrify Micrgrid" vs "Electrify Microgrid").
 */
export function nearMatchReason(a: string, b: string): NearMatchReason | null {
  const ka = normaliseName(a);
  const kb = normaliseName(b);
  if (!ka || !kb) return null;
  if (ka === kb) return "same-words";

  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size >= 2 && [...small].every((t) => large.has(t))) return "contains";

  const shorter = Math.min(ka.length, kb.length);
  const limit = shorter >= 16 ? 2 : shorter >= 8 ? 1 : 0;
  if (limit > 0 && levenshtein(ka, kb, limit) <= limit) return "spelling";
  return null;
}

export interface NamedPayer {
  payerId: string;
  name: string;
}

export interface NearDuplicate extends NamedPayer {
  reason: NearMatchReason;
}

/** Existing payers whose names look like `name`. Exact duplicates are not included. */
export function findNearDuplicates(
  name: string,
  existing: readonly NamedPayer[],
  excludePayerId?: string,
): NearDuplicate[] {
  const out: NearDuplicate[] = [];
  for (const p of existing) {
    if (p.payerId === excludePayerId || isSameName(p.name, name)) continue;
    const reason = nearMatchReason(name, p.name);
    if (reason) out.push({ ...p, reason });
  }
  return out;
}

export const NEAR_MATCH_LABELS: Record<NearMatchReason, string> = {
  "same-words": "same name apart from case, punctuation or words like Limited",
  contains: "contains the same distinguishing words",
  spelling: "spelt almost the same",
};
