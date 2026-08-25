export type V2AttendanceRow = { id: string; date: string; operative: string; hours: number; shift?: string; trade?: string; crew?: string; employer?: string; breakHours?: number };
export type AttendanceImportIssue = { row: number; message: string };

const aliases = { date: ["date", "work date"], operative: ["operative", "operative name", "name", "employee", "employee name", "operative id", "employee id", "id"], hours: ["actual hours", "hours", "worked hours", "total hours"], signIn: ["sign in", "sign-in", "time in", "start time"], signOut: ["sign out", "sign-out", "time out", "finish time"], shift: ["shift"], trade: ["trade", "position"], crew: ["crew", "gang"], employer: ["employer", "company"], breakHours: ["break hours", "break"] } as const;
const normal = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const value = (row: Record<string, unknown>, names: readonly string[]) => { const wanted = names.map(normal); return Object.entries(row).find(([key]) => wanted.includes(normal(key)))?.[1]; };
const text = (input: unknown) => String(input ?? "").trim();
const number = (input: unknown) => { const raw = text(input).replace(/,/g, ""); if (!raw) return undefined; const parsed = Number(raw); return Number.isFinite(parsed) ? parsed : undefined; };
const date = (input: unknown) => { if (input instanceof Date && !Number.isNaN(input.getTime())) return input.toISOString().slice(0, 10); const parsed = new Date(text(input)); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10); };
const timeHours = (input: unknown) => { const match = text(input).match(/^(\d{1,2}):(\d{2})/); return match ? Number(match[1]) + Number(match[2]) / 60 : undefined; };

export function parseAttendanceRows(rows: Record<string, unknown>[]) {
  const issues: AttendanceImportIssue[] = [];
  const attendance = rows.flatMap((row, index): V2AttendanceRow[] => {
    const rowNumber = index + 2; const workDate = date(value(row, aliases.date)); const operative = text(value(row, aliases.operative)); const breakHours = Math.max(0, number(value(row, aliases.breakHours)) ?? 0); let hours = number(value(row, aliases.hours));
    if (hours === undefined) { const start = timeHours(value(row, aliases.signIn)); const finish = timeHours(value(row, aliases.signOut)); if (start !== undefined && finish !== undefined) hours = (finish < start ? finish + 24 : finish) - start - breakHours; }
    if (!workDate || !operative || hours === undefined || hours <= 0) { issues.push({ row: rowNumber, message: "Date, operative name/ID and positive actual hours (or sign-in/out times) are required." }); return []; }
    return [{ id: `attendance-${workDate}-${index}-${operative}`, date: workDate, operative, hours, breakHours, shift: text(value(row, aliases.shift)), trade: text(value(row, aliases.trade)), crew: text(value(row, aliases.crew)), employer: text(value(row, aliases.employer)) }];
  });
  return { attendance, issues };
}

export function labourControl(attendance: V2AttendanceRow[], allocatedHours: number, hoursPerMd: number) { const attendanceHours = attendance.reduce((sum, row) => sum + row.hours, 0); return { men: new Set(attendance.map((row) => row.operative.toLowerCase())).size, attendanceHours, signedInMd: hoursPerMd > 0 ? attendanceHours / hoursPerMd : 0, allocatedHours, allocatedMd: hoursPerMd > 0 ? allocatedHours / hoursPerMd : 0, unallocatedHours: attendanceHours - allocatedHours }; }
