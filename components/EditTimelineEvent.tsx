"use client";

import { useState } from "react";
import type { ProgrammeActivity, TimelineEvent } from "@/types/site";

type Props = {
  event: TimelineEvent;
  activity?: ProgrammeActivity;
  canEditProgramme: boolean;
  onCancel: () => void;
  onSave: (event: TimelineEvent) => void | Promise<void>;
};

function durationMinutes(start: string, finish: string): number {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [finishHour, finishMinute] = finish.split(":").map(Number);
  let finishValue = finishHour * 60 + finishMinute;
  const startValue = startHour * 60 + startMinute;
  if (finishValue < startValue) finishValue += 24 * 60;
  return Math.max(0, finishValue - startValue);
}

export default function EditTimelineEvent({ event, activity, canEditProgramme, onCancel, onSave }: Props) {
  const [title, setTitle] = useState(event.title);
  const [startTime, setStartTime] = useState(event.startTime ?? event.time);
  const [finishTime, setFinishTime] = useState(event.finishTime ?? event.startTime ?? event.time);
  const [quantity, setQuantity] = useState(event.quantity === undefined ? "" : String(event.quantity));
  const [percentComplete, setPercentComplete] = useState(event.percentComplete === undefined ? activity?.physicalPercentComplete === undefined ? "" : String(activity.physicalPercentComplete) : String(event.percentComplete));
  const [notes, setNotes] = useState(event.notes ?? "");
  const [status, setStatus] = useState<TimelineEvent["status"]>(event.status ?? "completed");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    const numericQuantity = quantity.trim() ? Number(quantity) : undefined;
    const numericPercent = percentComplete.trim() ? Number(percentComplete) : undefined;
    if (!title.trim() || !startTime || !finishTime) return setError("Enter a title, start time and finish time.");
    if (numericQuantity !== undefined && (!Number.isFinite(numericQuantity) || numericQuantity < 0)) return setError("Enter a valid quantity.");
    if (numericPercent !== undefined && (!Number.isFinite(numericPercent) || numericPercent < 0 || numericPercent > 100)) return setError("Enter a percentage between 0 and 100.");
    setPending(true);
    try {
      await onSave({ ...event, title: title.trim(), time: startTime, startTime, finishTime, duration: durationMinutes(startTime, finishTime), quantity: numericQuantity, percentComplete: numericPercent, notes: notes.trim() || undefined, status });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the timeline record.");
      setPending(false);
    }
  }

  return <section className="site-record-modal">
    <div className="site-record-modal-header"><div><p className="eyebrow">Edit timeline record</p><h2>{event.title}</h2></div><button type="button" className="site-record-close" onClick={onCancel} aria-label="Close">×</button></div>
    <label className="attendance-field"><span>Title</span><input value={title} onChange={(change) => setTitle(change.target.value)} readOnly={Boolean(activity)} /></label>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      <label className="attendance-field"><span>Start time</span><input type="time" value={startTime} onChange={(change) => setStartTime(change.target.value)} /></label>
      <label className="attendance-field"><span>Finish time</span><input type="time" value={finishTime} onChange={(change) => setFinishTime(change.target.value)} /></label>
    </div>
    {event.type === "work" && <label className="attendance-field"><span>Actual quantity</span><input type="number" min="0" step="any" value={quantity} onChange={(change) => setQuantity(change.target.value)} /></label>}
    {event.type === "work" && <label className="attendance-field"><span>Physical % complete</span><input type="number" min="0" max="100" step="0.1" value={percentComplete} onChange={(change) => setPercentComplete(change.target.value)} disabled={!canEditProgramme} /></label>}
    <label className="attendance-field"><span>Status</span><select value={status} onChange={(change) => setStatus(change.target.value as TimelineEvent["status"])}><option value="active">Active</option><option value="completed">Completed</option></select></label>
    <label className="attendance-field"><span>Description</span><textarea rows={4} value={notes} onChange={(change) => setNotes(change.target.value)} /></label>
    {error && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error}</p>}
    <button type="button" className="add-event-button" disabled={pending} onClick={() => void save()}>{pending ? "Saving…" : "Save changes"}</button>
    <button type="button" className="secondary-button site-record-cancel" disabled={pending} onClick={onCancel}>Cancel</button>
  </section>;
}
