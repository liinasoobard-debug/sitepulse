"use client";

import {
  duplicatePreviousDay,
  getActiveDate,
  getLocalDate,
  loadDay,
  setActiveDate,
} from "@/lib/storage";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function moveDate(date: string, amount: number): string {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return getLocalDate(next);
}

export default function DateSelector() {
  const pathname = usePathname();
  const [date, setDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const activeDate = getActiveDate();
      setDate(activeDate);
      loadDay();
    });
    return () => { cancelled = true; };
  }, []);

  function openDate(nextDate: string) {
    setActiveDate(nextDate);
    loadDay();
    setDate(nextDate);
    window.location.assign(pathname || "/");
  }

  function duplicate() {
    const current = loadDay();
    const hasData = Boolean(
      current &&
      (current.attendance.length || current.crews?.length || current.events.length)
    );
    if (hasData && !window.confirm("Replace this date's attendance and gangs, and clear its timeline?")) {
      return;
    }
    duplicatePreviousDay();
    window.location.assign(pathname || "/");
  }

  if (!date) return null;

  return (
    <section className="date-selector" aria-label="Site date">
      <div className="date-selector-inner">
        <button type="button" className="secondary-button" onClick={() => openDate(moveDate(date, -1))} aria-label="Previous day">
          ← Previous
        </button>
        <label className="date-selector-field">
          <span>DATE</span>
          <input type="date" value={date} onChange={(event) => openDate(event.target.value)} />
        </label>
        <button type="button" className="secondary-button" onClick={() => openDate(moveDate(date, 1))} aria-label="Next day">
          Next →
        </button>
        <button type="button" className="secondary-button" onClick={duplicate}>
          Duplicate Previous Day
        </button>
      </div>
    </section>
  );
}
