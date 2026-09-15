"use client";

import { createClient } from "@/lib/supabase/client";

export type DailyAttendanceTotal = { date: string; operatives: number };

export async function loadDailyAttendanceTotals(projectId: string, startDate: string, endDate: string): Promise<DailyAttendanceTotal[]> {
  const { data, error } = await createClient()
    .from("daily_attendance")
    .select("work_date,operative_id")
    .eq("project_id", projectId)
    .eq("present", true)
    .gte("work_date", startDate)
    .lte("work_date", endDate);
  if (error) throw error;

  const operativesByDate = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (!row.work_date || !row.operative_id) continue;
    const date = String(row.work_date);
    const operatives = operativesByDate.get(date) ?? new Set<string>();
    operatives.add(String(row.operative_id));
    operativesByDate.set(date, operatives);
  }

  return [...operativesByDate.entries()]
    .map(([date, operatives]) => ({ date, operatives: operatives.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
