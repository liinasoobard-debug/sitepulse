import assert from "node:assert/strict";
import test from "node:test";
import { labourControl, parseAttendanceRows } from "./v2Labour.ts";
import { v2Productivity } from "./v2Productivity.ts";

test("imports ten men working ten hours and controls allocation", () => { const rows = Array.from({ length: 10 }, (_, index) => ({ Date: "2026-08-25", "Operative name": `Person ${index + 1}`, "Actual hours": 10 })); const parsed = parseAttendanceRows(rows); assert.equal(parsed.attendance.length, 10); assert.deepEqual(labourControl(parsed.attendance, 100, 8), { men: 10, attendanceHours: 100, signedInMd: 12.5, allocatedHours: 100, allocatedMd: 12.5, unallocatedHours: 0 }); });
test("calculates attendance from sign-in/out less breaks", () => { const parsed = parseAttendanceRows([{ Date: "2026-08-25", Name: "A", "Sign-in": "07:00", "Sign-out": "17:30", "Break hours": .5 }]); assert.equal(parsed.attendance[0].hours, 10); });
test("reports incomplete attendance rows", () => { assert.equal(parseAttendanceRows([{ Date: "2026-08-25", Name: "A" }]).issues.length, 1); });
test("complete day allocates 60 and 40 hours with no unallocated labour and consistent PF", () => { const attendance = Array.from({ length: 10 }, (_, index) => ({ Date: "2026-08-25", Name: `P${index}`, Hours: 10 })); const rows = parseAttendanceRows(attendance).attendance; const a = v2Productivity({ plannedQuantity: 100, plannedManDays: 10 }, 20, 60, 8); const b = v2Productivity({ plannedQuantity: 50, plannedManDays: 10 }, 10, 40, 8); const control = labourControl(rows, 60 + 40, 8); assert.equal(control.unallocatedHours, 0); assert.equal(a.actualManDays, 7.5); assert.equal(b.actualManDays, 5); assert.equal((a.earnedManDays! + b.earnedManDays!) / (a.actualManDays! + b.actualManDays!), .32); });
