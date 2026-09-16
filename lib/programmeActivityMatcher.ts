import type { ProgrammeActivity } from "../types/site.ts";
import type { NaturalLanguageInterpretation } from "./naturalLanguageUpdate.ts";

export type ProgrammeMatchConfidence = "high" | "medium" | "low";

export type ProgrammeMatchCandidate = {
  activity: ProgrammeActivity;
  score: number;
  confidence: ProgrammeMatchConfidence;
  reasons: string[];
};

// Words that are too generic to count as evidence of a work type/activity match
// (record-type verbs, crew/quantity language, connectives, location words already
// scored separately). Anything not in this list is treated as a candidate work-type
// token and compared against the programme activity's own fields.
const GENERIC_WORDS = new Set([
  "work", "works", "working", "installed", "install", "installing",
  "activity", "activities", "gang", "gangs", "crew", "crews",
  "operative", "operatives", "operator", "operators",
  "people", "guys", "guy", "lads", "lad", "men", "man",
  "stopped", "restarted", "waiting", "delayed", "delay", "late",
  "additional", "extra", "change", "changes", "variation",
  "disrupted", "disruption", "stood", "down",
  "completed", "fitted", "fixed", "progressed", "carried", "out",
  "during", "while", "because", "due", "owing",
  "north", "south", "east", "west", "level", "elevation", "grid", "grids",
  "the", "was", "were", "not", "could", "start", "started",
  "on", "in", "of", "for", "and", "a", "an", "to", "from", "until", "at", "by", "with",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "access", "site",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((word) => word.length >= 3);
}

function workTypeTokens(text: string): string[] {
  return tokenize(text).filter((word) => !GENERIC_WORDS.has(word));
}

function activityFieldTokens(activity: ProgrammeActivity): Set<string> {
  const fields = [activity.activityName, activity.activity, activity.workActivity, activity.productType, activity.trade];
  return new Set(fields.flatMap((field) => (field ? tokenize(field) : [])));
}

type LocationMentions = {
  elevation: string | null;
  level: string | null;
  grid: { start: string; end: string } | null;
};

function extractElevationMention(text: string): string | null {
  const match = text.match(/\b(north|south|east|west)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function extractLevelMention(text: string): string | null {
  const match = text.match(/\blevel\s?(\d{1,2})\b/i) ?? text.match(/\bl(\d{1,2})\b/i);
  return match ? match[1].padStart(2, "0") : null;
}

function extractGridMention(text: string): { start: string; end: string } | null {
  const match = text.match(/\bgrids?\s+([a-z])\s*(?:-|to)\s*(?:grid\s+)?([a-z])\b/i);
  return match ? { start: match[1].toLowerCase(), end: match[2].toLowerCase() } : null;
}

function locationMentionsFrom(originalText: string, interpretation: NaturalLanguageInterpretation): LocationMentions {
  // The interpreter's composite locationText (e.g. "North Elevation · Level 10") is
  // combined with the raw text so bare direction words it deliberately ignores
  // (e.g. a lone "North" with no elevation/level suffix) are still considered here.
  const combined = `${originalText} ${interpretation.locationText ?? ""}`;
  return {
    elevation: extractElevationMention(combined),
    level: extractLevelMention(combined),
    grid: extractGridMention(combined),
  };
}

function normaliseElevationField(value?: string): string | null {
  if (!value) return null;
  const match = value.match(/\b(north|south|east|west)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function normaliseLevelField(value?: string): string | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2})/);
  return match ? match[1].padStart(2, "0") : null;
}

function normaliseGridField(value?: string): { start: string; end: string } | null {
  if (!value) return null;
  const match = value.match(/([a-z])\s*(?:-|to)\s*([a-z])/i);
  return match ? { start: match[1].toLowerCase(), end: match[2].toLowerCase() } : null;
}

function titleCase(word: string): string {
  return `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
}

function scoreActivity(
  activity: ProgrammeActivity,
  mentions: LocationMentions,
  originalText: string,
  workTokens: string[]
): { score: number; reasons: string[]; locationStrong: boolean; workTypeMatched: boolean } {
  let score = 0;
  const reasons: string[] = [];
  let elevationMatched = false;
  let levelMatched = false;
  let gridMatched = false;

  if (mentions.elevation && mentions.elevation === normaliseElevationField(activity.elevation)) {
    elevationMatched = true;
    score += 2;
    reasons.push(`${titleCase(mentions.elevation)} Elevation matched`);
  }

  if (mentions.level && mentions.level === normaliseLevelField(activity.level)) {
    levelMatched = true;
    score += 2;
    reasons.push(`Level ${mentions.level} matched`);
  }

  if (mentions.grid) {
    const activityGrid = normaliseGridField(activity.gridline);
    if (activityGrid && activityGrid.start === mentions.grid.start && activityGrid.end === mentions.grid.end) {
      gridMatched = true;
      score += 3;
      reasons.push(`Grid ${mentions.grid.start.toUpperCase()}-${mentions.grid.end.toUpperCase()} matched`);
    }
  }

  if (activity.building?.trim() && originalText.toLowerCase().includes(activity.building.trim().toLowerCase())) {
    score += 1;
    reasons.push(`${activity.building.trim()} matched building`);
  }

  const activityTokens = activityFieldTokens(activity);
  const matchedWorkTokens = workTokens.filter((token) => activityTokens.has(token));
  for (const token of matchedWorkTokens) {
    score += 2;
    reasons.push(`${token} matched activity`);
  }

  // Low-weight tie-breaker only: an activity's programme status/dates never rule it
  // out, but a currently-active activity is slightly more likely to be the one
  // referenced by a live site update.
  if (activity.actualStart && !activity.actualFinish) {
    score += 0.5;
  }

  return {
    score,
    reasons,
    locationStrong: (elevationMatched && levelMatched) || gridMatched,
    workTypeMatched: matchedWorkTokens.length > 0,
  };
}

// Pure, deterministic shortlist of likely programme activities for a natural-language
// site update. Never guesses: activities with no matching evidence are excluded, and
// confidence is only ever "high" when there is a clear, unambiguous lead.
export function matchProgrammeActivities(
  originalText: string,
  interpretation: NaturalLanguageInterpretation,
  activities: ProgrammeActivity[]
): ProgrammeMatchCandidate[] {
  const mentions = locationMentionsFrom(originalText, interpretation);
  const workTokens = workTypeTokens(originalText);

  const scored = activities
    .map((activity) => ({ activity, ...scoreActivity(activity, mentions, originalText, workTokens) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return [];
  }

  const top3 = scored.slice(0, 3);
  const topScore = top3[0].score;
  const secondScore = top3[1]?.score ?? 0;
  const clearLead = topScore - secondScore >= 2;

  return top3.map((candidate, index) => {
    let confidence: ProgrammeMatchConfidence;
    if (index === 0 && candidate.locationStrong && candidate.workTypeMatched && clearLead) {
      confidence = "high";
    } else if (candidate.locationStrong || candidate.workTypeMatched) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    return {
      activity: candidate.activity,
      score: candidate.score,
      confidence,
      reasons: candidate.reasons,
    };
  });
}
