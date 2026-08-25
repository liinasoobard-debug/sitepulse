"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getActiveDate, getActiveProject, getActiveProjectId, setActiveDate } from "@/lib/storage";
import { loadV2DailyRecords, loadV2Programme, saveV2DailyRecord } from "@/lib/supabase/v2Data";
import { plannedQuantityToDate, v2Productivity, type V2DailyRecord } from "@/lib/v2Productivity";
import type { ProgrammeActivity } from "@/types/site";

type Result = { quantity: number; actual: number | null; earned: number | null; pf: number | null; variance: number };
const display = (value: number | null, digits = 2) => value === null ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: digits });

export default function DailyUpdatePage() {
  const [activities, setActivities] = useState<ProgrammeActivity[]>([]);
  const [records, setRecords] = useState<V2DailyRecord[]>([]);
  const [date, setDate] = useState("");
  const [activityId, setActivityId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [labour, setLabour] = useState("");
  const [labourUnit, setLabourUnit] = useState<"hours" | "md">("hours");
  const [constrained, setConstrained] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const hoursPerMd = getActiveProject()?.hoursPerManDay ?? 8;

  useEffect(() => {
    queueMicrotask(() => setDate(getActiveDate()));
    Promise.all([loadV2Programme(getActiveProjectId()), loadV2DailyRecords(getActiveProjectId())])
      .then(([programme, daily]) => { setActivities(programme.activities); setRecords(daily); setActivityId(programme.activities.find((row) => row.plannedQuantity > 0 && Boolean(row.unit) && Number(row.plannedManDays) > 0)?.programmeActivityId ?? ""); if (programme.demo) setDate("2026-08-25"); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load daily update."));
  }, []);

  const activity = useMemo(() => activities.find((row) => row.programmeActivityId === activityId), [activities, activityId]);
  const target = activity ? v2Productivity(activity, 0, 0, hoursPerMd).targetProductivity : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!activity) return setError("Select a programme activity.");
    const enteredQuantity = Number(quantity);
    const enteredLabour = Number(labour);
    if (!(enteredQuantity >= 0) || !(enteredLabour > 0)) return setError("Enter a valid quantity and labour value.");
    if (constrained && !reason.trim()) return setError("Enter the constraint reason.");
    const labourHours = labourUnit === "md" ? enteredLabour * hoursPerMd : enteredLabour;
    setSaving(true); setError(""); setResult(null);
    try {
      const id = await saveV2DailyRecord(getActiveProjectId(), activity, { date, quantity: enteredQuantity, labourHours, constrained, constraintReason: reason.trim() || undefined, note: note.trim() || undefined });
      const saved = { id, date, activityId, quantity: enteredQuantity, labourHours, constrained, constraintReason: reason.trim() || undefined, note: note.trim() || undefined };
      const nextRecords = [...records, saved]; setRecords(nextRecords); setActiveDate(date);
      const cumulative = nextRecords.filter((row) => row.activityId === activityId && row.date <= date).reduce((sum, row) => sum + row.quantity, 0);
      const metrics = v2Productivity(activity, enteredQuantity, labourHours, hoursPerMd);
      setResult({ quantity: enteredQuantity, actual: metrics.actualManDays, earned: metrics.earnedManDays, pf: metrics.productivityFactor, variance: cumulative - plannedQuantityToDate(activity, date) });
      setQuantity(""); setLabour(""); setNote(""); setConstrained(false); setReason("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save daily update."); }
    finally { setSaving(false); }
  }

  return <main className="v2-page v2-form-page">
    <header className="v2-hero"><div><p className="eyebrow">Daily Update</p><h1>Record today&apos;s result</h1><p>One programme activity, completed quantity and the labour used.</p></div></header>
    <form className="v2-panel v2-daily-form" onSubmit={submit}>
      <label>Date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="v2-field-wide">Programme activity<select required value={activityId} onChange={(event) => setActivityId(event.target.value)}><option value="">Select activity</option>{activities.filter((row) => row.plannedQuantity > 0 && Boolean(row.unit) && Number(row.plannedManDays) > 0).map((row) => <option key={row.id} value={row.programmeActivityId}>{row.activityName || row.activity} · {row.elevation} {row.level}</option>)}</select></label>
      {activity && <div className="v2-activity-context v2-field-wide"><span>Planned: {activity.plannedQuantity} {activity.unit}</span><span>Budget: {display(activity.plannedManDays ?? null)} MD</span><span>Target: {display(target)} {activity.unit}/MD</span></div>}
      <label>Quantity completed<input required min="0" step="any" inputMode="decimal" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      <label>Actual labour<div className="v2-inline-input"><input required min="0.01" step="any" inputMode="decimal" type="number" value={labour} onChange={(event) => setLabour(event.target.value)} /><select value={labourUnit} onChange={(event) => setLabourUnit(event.target.value as "hours" | "md")}><option value="hours">Hours</option><option value="md">Man-days</option></select></div></label>
      <fieldset className="v2-field-wide"><legend>Was the activity constrained?</legend><label className="v2-check"><input type="checkbox" checked={constrained} onChange={(event) => setConstrained(event.target.checked)} /> Yes</label></fieldset>
      {constrained && <label className="v2-field-wide">Constraint reason<input required maxLength={160} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. MEWP access" /></label>}
      <label className="v2-field-wide">Note <small>Optional</small><textarea maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label>
      {error && <p className="dashboard-notice error v2-field-wide" role="alert">{error}</p>}
      <button className="primary-button v2-primary-action v2-field-wide" type="submit" disabled={saving}>{saving ? "Saving…" : "Save daily update"}</button>
    </form>
    {result && <section className="v2-panel v2-result" aria-live="polite"><p className="eyebrow">Update saved</p><h2>Daily result</h2><dl><div><dt>Quantity achieved</dt><dd>{display(result.quantity)}</dd></div><div><dt>Actual MD</dt><dd>{display(result.actual)}</dd></div><div><dt>Earned MD</dt><dd>{display(result.earned)}</dd></div><div><dt>Daily PF</dt><dd>{display(result.pf)}</dd></div></dl><strong className={result.variance >= 0 ? "v2-positive" : "v2-negative"}>{result.variance >= 0 ? "Ahead" : "Behind"} programme by {display(Math.abs(result.variance))} {activity?.unit || "units"}</strong></section>}
  </main>;
}
