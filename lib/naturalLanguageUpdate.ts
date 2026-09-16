import type { SiteRecordType } from "../types/site.ts";

export type NaturalLanguageInterpretation = {
  recordType: SiteRecordType | null;
  startTime: string | null;
  finishTime: string | null;
  durationMinutes: number | null;
  operativeCount: number | null;
  gangText: string | null;
  locationText: string | null;
  reason: string | null;
  originalText: string;
};

// Conservative keyword rules, checked in this priority order. The first
// category with a matching keyword wins; if none match, the caller must
// treat the record type as "needs confirmation" rather than guessing.
const RECORD_TYPE_KEYWORDS: Array<{ type: SiteRecordType; keywords: string[] }> = [
  { type: "disruption", keywords: ["disrupted", "disruption", "stop-start", "interrupted"] },
  { type: "waiting", keywords: ["waiting", "standing", "stood down", "couldn't start", "could not start"] },
  { type: "delay", keywords: ["delayed", "delay", "late"] },
  { type: "variation", keywords: ["variation", "additional work", "extra work", "change"] },
  { type: "break", keywords: ["tea break", "lunch break", "break"] },
  { type: "work", keywords: ["installed", "completed", "fitted", "fixed", "progressed"] },
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

function detectRecordType(text: string): SiteRecordType | null {
  const lower = text.toLowerCase();
  for (const { type, keywords } of RECORD_TYPE_KEYWORDS) {
    if (keywords.some((keyword) => lower.includes(keyword))) return type;
  }
  return null;
}

type TimeMatch = { index: number; minutesOfDay: number; text: string };

function to24Hour(hour: number, minute: number, meridiem?: string): number | null {
  let normalisedHour = hour;
  if (meridiem) {
    const isPm = meridiem.toLowerCase() === "pm";
    if (normalisedHour < 1 || normalisedHour > 12) return null;
    normalisedHour = normalisedHour % 12;
    if (isPm) normalisedHour += 12;
  }
  if (normalisedHour > 23 || minute > 59) return null;
  return normalisedHour * 60 + minute;
}

function formatTime(minutesOfDay: number): string {
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function findTimes(text: string): TimeMatch[] {
  const matches: TimeMatch[] = [];

  for (const match of text.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm)?\b/gi)) {
    const minutesOfDay = to24Hour(Number(match[1]), Number(match[2]), match[3]);
    if (minutesOfDay !== null && match.index !== undefined) {
      matches.push({ index: match.index, minutesOfDay, text: match[0] });
    }
  }

  for (const match of text.matchAll(/\b(1[0-2]|0?[1-9])\s?(am|pm)\b/gi)) {
    const minutesOfDay = to24Hour(Number(match[1]), 0, match[2]);
    if (minutesOfDay !== null && match.index !== undefined) {
      matches.push({ index: match.index, minutesOfDay, text: match[0] });
    }
  }

  // Bare four-digit site times (e.g. "1015") are only trusted when introduced by
  // explicit time language, so quantities/years/IDs are never misread as times.
  for (const match of text.matchAll(/\b(?:at|from|to|until)\s+([01]\d|2[0-3])([0-5]\d)\b/gi)) {
    const minutesOfDay = to24Hour(Number(match[1]), Number(match[2]));
    if (minutesOfDay !== null && match.index !== undefined) {
      matches.push({ index: match.index, minutesOfDay, text: match[0] });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

function detectOperativeCount(text: string): number | null {
  const match = text.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(men|man|operatives|operative|guys|guy|lads|lad|people|person)\b/i);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  const value = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
  if (!value || value < 1 || value > 20) return null;
  return value;
}

function detectGang(text: string): string | null {
  const match = text.match(/\b(gang|crew)\s+([a-z]|\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  return match ? match[0].trim() : null;
}

function titleCase(word: string): string {
  return `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
}

function detectLocation(text: string): string | null {
  const fragments: string[] = [];

  // A direction is only ever treated as a location when it is directly tied
  // to an elevation/level phrase (e.g. "North L10", "North Elevation Level 10") —
  // a bare "north" elsewhere in the text is deliberately ignored.
  const directionWithLevel = text.match(/\b(north|south|east|west)\s+(?:elevation\s+)?l(?:evel)?\s?(\d{1,2})\b/i);
  if (directionWithLevel) {
    fragments.push(`${titleCase(directionWithLevel[1])} Elevation`);
    fragments.push(`Level ${directionWithLevel[2].padStart(2, "0")}`);
  } else {
    const elevation = text.match(/\b(north|south|east|west)\s+elevation\b/i);
    if (elevation) fragments.push(`${titleCase(elevation[1])} Elevation`);

    const level = text.match(/\blevel\s?(\d{1,2})\b/i) ?? text.match(/\bL(\d{1,2})\b/);
    if (level) fragments.push(`Level ${level[1].padStart(2, "0")}`);
  }

  const grid = text.match(/\bgrids?\s+([a-z])\s*(?:-|to)\s*(?:grid\s+)?([a-z])\b/i);
  if (grid) fragments.push(`Grid ${grid[1].toUpperCase()}-${grid[2].toUpperCase()}`);

  return fragments.length ? fragments.join(" · ") : null;
}

function detectReason(text: string): string | null {
  const match = text.match(/(?:because of|because|due to|owing to)\s+(.+?)(?:[.!]|$)/i);
  if (!match) return null;
  const reason = match[1].trim();
  return reason.length ? reason : null;
}

// Pure, deterministic, keyword-based interpretation of a free-text site update.
// This is NOT AI/NLP — it only recognises the literal patterns documented above,
// and returns null fields rather than guessing when a pattern is not present.
export function interpretNaturalLanguageUpdate(text: string): NaturalLanguageInterpretation {
  const trimmed = text.trim();
  const times = findTimes(trimmed);
  const [startMatch, finishMatch] = times;
  const startTime = startMatch ? formatTime(startMatch.minutesOfDay) : null;
  const finishTime = finishMatch ? formatTime(finishMatch.minutesOfDay) : null;
  const durationMinutes = startMatch && finishMatch
    ? ((finishMatch.minutesOfDay - startMatch.minutesOfDay + 1440) % 1440) || null
    : null;

  return {
    recordType: detectRecordType(trimmed),
    startTime,
    finishTime,
    durationMinutes,
    operativeCount: detectOperativeCount(trimmed),
    gangText: detectGang(trimmed),
    locationText: detectLocation(trimmed),
    reason: detectReason(trimmed),
    originalText: trimmed,
  };
}

export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) return `${hours}h ${remainder}m`;
  if (hours) return `${hours}h`;
  return `${remainder}m`;
}
