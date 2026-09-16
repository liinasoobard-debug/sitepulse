import assert from "node:assert/strict";
import test from "node:test";
import { formatDurationMinutes, interpretNaturalLanguageUpdate } from "./naturalLanguageUpdate.ts";

test("stopped/restarted phrasing without a listed keyword is left as needs-confirmation, not guessed", () => {
  const result = interpretNaturalLanguageUpdate(
    "Four operatives on Gang 1 stopped work on North Elevation Level 10 at 10:15 because the mast climber was unavailable. Work restarted at 12:30."
  );
  assert.equal(result.recordType, null);
  assert.equal(result.startTime, "10:15");
  assert.equal(result.finishTime, "12:30");
  assert.equal(result.durationMinutes, 135);
  assert.equal(formatDurationMinutes(result.durationMinutes!), "2h 15m");
  assert.equal(result.operativeCount, 4);
  assert.equal(result.gangText, "Gang 1");
  assert.equal(result.locationText, "North Elevation · Level 10");
  assert.equal(result.reason, "the mast climber was unavailable");
});

test("waiting keyword is recognised distinctly from disruption", () => {
  const result = interpretNaturalLanguageUpdate(
    "Four guys were waiting for the mast climber on North L10 from 10.15 until 12.30."
  );
  assert.equal(result.recordType, "waiting");
  assert.equal(result.startTime, "10:15");
  assert.equal(result.finishTime, "12:30");
  assert.equal(result.durationMinutes, 135);
  assert.equal(result.operativeCount, 4);
  assert.equal(result.gangText, null);
  // "North L10" is now recognised as directional shorthand for
  // "North Elevation · Level 10".
  assert.equal(result.locationText, "North Elevation · Level 10");
  assert.equal(result.reason, null);
});

test("measured work keyword, gang letter and level padding are recognised", () => {
  const result = interpretNaturalLanguageUpdate(
    "Gang 2 installed 18m2 of glazing on South Elevation L09 from 08:00 to 16:00."
  );
  assert.equal(result.recordType, "work");
  assert.equal(result.startTime, "08:00");
  assert.equal(result.finishTime, "16:00");
  assert.equal(result.durationMinutes, 480);
  assert.equal(formatDurationMinutes(result.durationMinutes!), "8h");
  assert.equal(result.operativeCount, null);
  assert.equal(result.gangText, "Gang 2");
  assert.equal(result.locationText, "South Elevation · Level 09");
  assert.equal(result.reason, null);
});

test("'additional work' maps to variation, and Crew B is recognised", () => {
  const result = interpretNaturalLanguageUpdate(
    "Additional work carried out on East Elevation Level 11 by Crew B."
  );
  assert.equal(result.recordType, "variation");
  assert.equal(result.startTime, null);
  assert.equal(result.finishTime, null);
  assert.equal(result.durationMinutes, null);
  assert.equal(result.operativeCount, null);
  assert.equal(result.gangText, "Crew B");
  assert.equal(result.locationText, "East Elevation · Level 11");
  assert.equal(result.reason, null);
});

test("a vague update with no recognisable pattern is entirely needs-confirmation", () => {
  const result = interpretNaturalLanguageUpdate(
    "The site was quiet this morning and nothing much happened."
  );
  assert.equal(result.recordType, null);
  assert.equal(result.startTime, null);
  assert.equal(result.finishTime, null);
  assert.equal(result.durationMinutes, null);
  assert.equal(result.operativeCount, null);
  assert.equal(result.gangText, null);
  assert.equal(result.locationText, null);
  assert.equal(result.reason, null);
});

test("bare four-digit times are only trusted when introduced by explicit time language", () => {
  const result = interpretNaturalLanguageUpdate(
    "Gang 1 stopped at 1015 because the mast climber was unavailable and restarted at 1230."
  );
  assert.equal(result.startTime, "10:15");
  assert.equal(result.finishTime, "12:30");
  assert.equal(result.durationMinutes, 135);
});

test("a bare four-digit year is never interpreted as a time", () => {
  const result = interpretNaturalLanguageUpdate("Gang 2 installed 18m2 of glazing during 2026.");
  assert.equal(result.startTime, null);
  assert.equal(result.finishTime, null);
  assert.equal(result.durationMinutes, null);
});

test("bare 'as' no longer produces a reason", () => {
  const result = interpretNaturalLanguageUpdate("The gang installed panels as well as brackets.");
  assert.equal(result.reason, null);
});
