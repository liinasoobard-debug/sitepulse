"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import * as XLSX from "xlsx";
import {
  deleteOperative,
  loadDay,
  loadAllSiteDays,
  loadOperatives,
  getActiveProject,
  getActiveDate,
  saveDay,
  saveOperatives,
  updateOperative,
} from "@/lib/storage";
import { calculateLabourRateBreakdown, DEFAULT_LABOUR_RATE_SETTINGS, labourRateRuleForCompany, normaliseLabourRateSettings } from "@/lib/labourRates";
import type {
  AttendanceRecord,
  LabourRateSettings,
  Operative,
  SiteDay,
  TimelineEvent,
} from "@/types/site";

type ImportRow = {
  Name?: unknown;
  Company?: unknown;
  Position?: unknown;
  "Hourly Rate"?: unknown;
  HourlyRate?: unknown;
  Rate?: unknown;
};
type AttendanceFilter = "all" | "on-site" | "not-on-site";

function getTodayDate(): string {
  return getActiveDate();
}

function getCurrentTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function createOperativeId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `operative-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function normaliseAttendance(
  records: AttendanceRecord[] | undefined
): AttendanceRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((record) => ({
    ...record,
    operativeId: String(record.operativeId),
    signIn: record.signIn ?? "",
    signOut: record.signOut ?? "",
  }));
}

function formatHours(hours: number): string {
  return hours.toFixed(2);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

function getText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getRate(row: ImportRow): number {
  const rawValue =
    row["Hourly Rate"] ??
    row.HourlyRate ??
    row.Rate ??
    "";

  const cleaned = String(rawValue)
    .replace("£", "")
    .replace(",", "")
    .trim();

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export default function AttendancePage() {
  const [operatives, setOperatives] = useState<Operative[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [labourRateSettings, setLabourRateSettings] = useState<LabourRateSettings>(DEFAULT_LABOUR_RATE_SETTINGS);

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [editingOperativeId, setEditingOperativeId] = useState("");
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newPosition, setNewPosition] = useState("");
  const [newHourlyRate, setNewHourlyRate] = useState("");
  const [formError, setFormError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("all");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [showCopyAttendance, setShowCopyAttendance] = useState(false);
  const [copySourceDate, setCopySourceDate] = useState("");
  const [attendanceSourceDays, setAttendanceSourceDays] = useState<SiteDay[]>([]);
  const [copyError, setCopyError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setOperatives(loadOperatives());
      setLabourRateSettings(normaliseLabourRateSettings(getActiveProject()?.labourRateSettings));

      const savedDay = loadDay();
      if (savedDay) {
        setAttendance(normaliseAttendance(savedDay.attendance));
        setEvents(Array.isArray(savedDay.events) ? savedDay.events : []);
      }
      const sourceDays = loadAllSiteDays()
        .filter((day) => day.date !== getActiveDate() && day.attendance.length > 0)
        .sort((a, b) => b.date.localeCompare(a.date));
      setAttendanceSourceDays(sourceDays);
      setCopySourceDate(sourceDays[0]?.date ?? "");
      setHasLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    const existingDay = loadDay();

    const updatedDay: SiteDay = {
      ...(existingDay ?? {
        date: getTodayDate(),
        attendance: [],
        events: [],
      }),
      date: getTodayDate(),
      attendance,
      events,
    };

    saveDay(updatedDay);
  }, [attendance, events, hasLoaded]);

  const attendanceRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    const matchingOperatives = search
      ? operatives.filter((operative) =>
          [
            operative.name,
            operative.company,
            operative.position,
          ].some((value) =>
            value.toLowerCase().includes(search)
          )
        )
      : operatives;

    return matchingOperatives.map((operative) => {
      const record = attendance.find(
        (item) =>
          String(item.operativeId) === String(operative.id)
      );

      const rateRule = labourRateRuleForCompany(labourRateSettings, operative.company);
      const breakdown = calculateLabourRateBreakdown(record?.signIn, record?.signOut, operative.hourlyRate, rateRule);
      const isOnSite = Boolean(record?.signIn && !record.signOut);

      return {
        operative,
        record,
        hours: breakdown.totalHours,
        backshiftHours: breakdown.backshiftHours,
        cost: breakdown.totalCost,
        rateRule,
        isOnSite,
      };
    }).filter((row) =>
      attendanceFilter === "all" ||
      (attendanceFilter === "on-site" ? row.isOnSite : !row.isOnSite)
    ).sort((a, b) =>
      Number(b.isOnSite) - Number(a.isOnSite) ||
      a.operative.name.localeCompare(b.operative.name)
    );
  }, [attendance, attendanceFilter, labourRateSettings, operatives, searchTerm]);

  const totals = useMemo(() => {
    return attendanceRows.reduce(
      (summary, row) => {
        const hasAttendance = Boolean(
          row.record?.signIn || row.record?.signOut
        );

        return {
          operatives:
            summary.operatives + (hasAttendance ? 1 : 0),
          hours: summary.hours + row.hours,
          backshiftHours: summary.backshiftHours + row.backshiftHours,
          cost: summary.cost + row.cost,
        };
      },
      {
        operatives: 0,
        hours: 0,
        backshiftHours: 0,
        cost: 0,
      }
    );
  }, [attendanceRows]);

  function resetAddPersonForm() {
    setNewName("");
    setNewCompany("");
    setNewPosition("");
    setNewHourlyRate("");
    setFormError("");
    setEditingOperativeId("");
  }

  function copyAttendanceFromDate() {
    const source = attendanceSourceDays.find((day) => day.date === copySourceDate);
    if (!source) {
      setCopyError("Select a date with recorded attendance.");
      return;
    }
    if (attendance.length > 0 && !window.confirm("Replace attendance for the current date with the selected date?")) return;
    setAttendance(structuredClone(source.attendance));
    setCopyError("");
    setShowCopyAttendance(false);
    setImportMessage(`Attendance copied from ${new Date(`${source.date}T12:00:00`).toLocaleDateString("en-GB")}.`);
  }

  function closeAddPersonForm() {
    resetAddPersonForm();
    setShowAddPerson(false);
  }

  function handleAddPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newName.trim();
    const company = newCompany.trim();
    const position = newPosition.trim();
    const hourlyRate = Number(newHourlyRate);

    if (!name) {
      setFormError("Enter the operative's name.");
      return;
    }

    if (!company) {
      setFormError("Enter the company.");
      return;
    }

    if (!position) {
      setFormError("Enter the position or trade.");
      return;
    }

    if (
      newHourlyRate.trim() === "" ||
      Number.isNaN(hourlyRate) ||
      hourlyRate < 0
    ) {
      setFormError("Enter a valid hourly rate.");
      return;
    }

    const duplicateExists = operatives.some(
      (operative) =>
        String(operative.id) !== editingOperativeId &&
        operative.name.trim().toLowerCase() ===
          name.toLowerCase() &&
        operative.company.trim().toLowerCase() ===
          company.toLowerCase()
    );

    if (duplicateExists) {
      setFormError(
        "An operative with this name and company already exists."
      );
      return;
    }

    const savedOperative: Operative = {
      id: editingOperativeId || createOperativeId(),
      name,
      company,
      position,
      hourlyRate,
    };

    if (editingOperativeId) {
      setOperatives(updateOperative(savedOperative));
    } else {
      const updatedOperatives = [...operatives, savedOperative];
      setOperatives(updatedOperatives);
      saveOperatives(updatedOperatives);
    }
    closeAddPersonForm();
  }

  function editOperative(operative: Operative) {
    setEditingOperativeId(String(operative.id));
    setNewName(operative.name);
    setNewCompany(operative.company);
    setNewPosition(operative.position);
    setNewHourlyRate(String(operative.hourlyRate));
    setFormError("");
    setShowAddPerson(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleImport(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setImportMessage("");
    setImportError("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("The spreadsheet does not contain a worksheet.");
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<ImportRow>(worksheet, {
        defval: "",
      });

      if (rows.length === 0) {
        throw new Error("The spreadsheet does not contain any rows.");
      }

      const existingKeys = new Set(
        operatives.map(
          (operative) =>
            `${operative.name.trim().toLowerCase()}|${operative.company
              .trim()
              .toLowerCase()}`
        )
      );

      const importedOperatives: Operative[] = [];
      let skippedRows = 0;

      rows.forEach((row) => {
        const name = getText(row.Name);
        const company = getText(row.Company);
        const position = getText(row.Position);
        const hourlyRate = getRate(row);

        if (!name || !company || !position) {
          skippedRows += 1;
          return;
        }

        const duplicateKey = `${name.toLowerCase()}|${company.toLowerCase()}`;

        if (existingKeys.has(duplicateKey)) {
          skippedRows += 1;
          return;
        }

        existingKeys.add(duplicateKey);

        importedOperatives.push({
          id: createOperativeId(),
          name,
          company,
          position,
          hourlyRate,
        });
      });

      if (importedOperatives.length === 0) {
        throw new Error(
          "No new operatives were imported. Check the column headings and duplicates."
        );
      }

      const updatedOperatives = [
        ...operatives,
        ...importedOperatives,
      ];

      setOperatives(updatedOperatives);
      saveOperatives(updatedOperatives);

      setImportMessage(
        `${importedOperatives.length} operative${
          importedOperatives.length === 1 ? "" : "s"
        } imported${skippedRows > 0 ? `, ${skippedRows} skipped` : ""}.`
      );
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "The spreadsheet could not be imported."
      );
    } finally {
      event.target.value = "";
    }
  }

  function downloadAttendanceTemplate() {
    const worksheet = XLSX.utils.json_to_sheet([{
      Name: "Jane Smith",
      Company: "Example Contractor",
      Position: "Installer",
      "Hourly Rate": 25,
    }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Operatives");
    XLSX.writeFile(workbook, "sitepulse-attendance-template.xlsx");
  }

  function updateAttendance(
    operative: Operative,
    field: "signIn" | "signOut",
    value: string
  ) {
    setAttendance((current) => {
      const existingRecord = current.find(
        (record) =>
          String(record.operativeId) === String(operative.id)
      );

      if (existingRecord) {
        return current.map((record) =>
          String(record.operativeId) === String(operative.id)
            ? {
                ...record,
                [field]: value,
              }
            : record
        );
      }

      const newRecord: AttendanceRecord = {
        operativeId: String(operative.id),
        signIn: field === "signIn" ? value : "",
        signOut: field === "signOut" ? value : "",
      };

      return [...current, newRecord];
    });
  }

  function signInNow(operative: Operative) {
    updateAttendance(
      operative,
      "signIn",
      getCurrentTime()
    );
  }

  function signOutNow(operative: Operative) {
    updateAttendance(
      operative,
      "signOut",
      getCurrentTime()
    );
  }

  function markNotOnSite(operative: Operative) {
    const operativeId = String(operative.id);
    setAttendance((current) => {
      const existingRecord = current.find((record) => String(record.operativeId) === operativeId);
      if (!existingRecord?.signIn) return current.filter((record) => String(record.operativeId) !== operativeId);
      if (existingRecord.signOut) return current;
      return current.map((record) => String(record.operativeId) === operativeId
        ? { ...record, signOut: getCurrentTime() }
        : record);
    });
  }

  function clearRecord(operativeId: string) {
    setAttendance((current) =>
      current.filter(
        (record) =>
          String(record.operativeId) !==
          String(operativeId)
      )
    );
  }

  function removeOperative(operative: Operative) {
    if (
      !window.confirm(
        `Remove ${operative.name} from the operative list? This will also remove their attendance and gang assignment for the selected date.`
      )
    ) {
      return;
    }

    const operativeId = String(operative.id);
    const updatedAttendance = attendance.filter(
      (record) => String(record.operativeId) !== operativeId
    );
    const existingDay = loadDay();

    setOperatives(deleteOperative(operativeId));
    setAttendance(updatedAttendance);

    if (existingDay) {
      saveDay({
        ...existingDay,
        attendance: updatedAttendance,
        crews: existingDay.crews?.map((crew) => ({
          ...crew,
          operativeIds: crew.operativeIds.filter(
            (id) => String(id) !== operativeId
          ),
        })),
      });
    }
  }

  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${getActiveDate()}T12:00:00`));

  return (
    <main className="timeline-page">
      <section className="timeline-panel">
        <header className="timeline-header">
          <div>
            <p className="eyebrow" suppressHydrationWarning>
              {today}
            </p>
            <h1>Attendance</h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                showAddPerson ? closeAddPersonForm() : setShowAddPerson(true)
              }
            >
              {showAddPerson ? "Cancel" : "+ Add Person"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => { setShowCopyAttendance((current) => !current); setCopyError(""); }}
            >
              Copy attendance from…
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => fileInputRef.current?.click()}
            >
              Import Excel
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={downloadAttendanceTemplate}
            >
              Download template
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImport}
              style={{ display: "none" }}
            />

            <Link
              href="/crews"
              className="secondary-button"
            >
              Crew Setup
            </Link>

            <Link
              href="/timeline"
              className="secondary-button"
            >
              Timeline
            </Link>
          </div>
        </header>

        {(importMessage || importError) && (
          <div
            style={{
              marginBottom: 18,
              padding: "12px 14px",
              borderRadius: 10,
              background: importError ? "#fff1f0" : "#f0fdf4",
              color: importError ? "#b42318" : "#166534",
              fontWeight: 600,
            }}
          >
            {importError || importMessage}
          </div>
        )}

        {showCopyAttendance && (
          <section style={{ display: "flex", alignItems: "end", gap: 12, marginBottom: 24, padding: 16, border: "1px solid #d7dde3", borderRadius: 8, background: "#f7f9fa", flexWrap: "wrap" }}>
            <label className="attendance-field" style={{ minWidth: 260, flex: "1 1 280px" }}>
              <span>Copy attendance from</span>
              <select value={copySourceDate} onChange={(event) => { setCopySourceDate(event.target.value); setCopyError(""); }}>
                <option value="">Select a recorded date</option>
                {attendanceSourceDays.map((day) => <option key={day.date} value={day.date}>{new Date(`${day.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {day.attendance.length} operative{day.attendance.length === 1 ? "" : "s"}</option>)}
              </select>
            </label>
            <button type="button" className="primary-button" style={{ width: "auto", minHeight: 42, marginTop: 0, padding: "9px 18px" }} disabled={!copySourceDate} onClick={copyAttendanceFromDate}>Copy attendance</button>
            <button type="button" className="secondary-button" onClick={() => setShowCopyAttendance(false)}>Cancel</button>
            {attendanceSourceDays.length === 0 && <p style={{ flexBasis: "100%", margin: 0, color: "#5f6b76" }}>No other dates have recorded attendance.</p>}
            {copyError && <p role="alert" style={{ flexBasis: "100%", margin: 0, color: "#b42318", fontWeight: 700 }}>{copyError}</p>}
          </section>
        )}

        {showAddPerson && (
          <section
            style={{
              marginBottom: 24,
              padding: 20,
              border: "1px solid #d9d9d9",
              borderRadius: 12,
              background: "#ffffff",
            }}
          >
            <h2 style={{ marginTop: 0 }}>{editingOperativeId ? "Edit Person Details" : "Add Person"}</h2>

            <form onSubmit={handleAddPerson}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 14,
                }}
              >
                <label>
                  <span
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Name
                  </span>

                  <input
                    type="text"
                    value={newName}
                    onChange={(event) =>
                      setNewName(event.target.value)
                    }
                    placeholder="e.g. John Smith"
                    autoFocus
                    style={{
                      width: "100%",
                      minHeight: 42,
                      padding: "8px 10px",
                    }}
                  />
                </label>

                <label>
                  <span
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Company
                  </span>

                  <input
                    type="text"
                    value={newCompany}
                    onChange={(event) =>
                      setNewCompany(event.target.value)
                    }
                    placeholder="e.g. ABC Carpentry"
                    style={{
                      width: "100%",
                      minHeight: 42,
                      padding: "8px 10px",
                    }}
                  />
                </label>

                <label>
                  <span
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Position / Trade
                  </span>

                  <input
                    type="text"
                    value={newPosition}
                    onChange={(event) =>
                      setNewPosition(event.target.value)
                    }
                    placeholder="e.g. Carpenter"
                    style={{
                      width: "100%",
                      minHeight: 42,
                      padding: "8px 10px",
                    }}
                  />
                </label>

                <label>
                  <span
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Hourly Rate
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newHourlyRate}
                    onChange={(event) =>
                      setNewHourlyRate(event.target.value)
                    }
                    placeholder="e.g. 25.00"
                    style={{
                      width: "100%",
                      minHeight: 42,
                      padding: "8px 10px",
                    }}
                  />
                </label>
              </div>

              {formError && (
                <p
                  role="alert"
                  style={{
                    marginBottom: 0,
                    color: "#b42318",
                    fontWeight: 600,
                  }}
                >
                  {formError}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 18,
                  flexWrap: "wrap",
                }}
              >
                <button type="submit" className="primary-button">
                  {editingOperativeId ? "Save Changes" : "Save Person"}
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeAddPersonForm}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="attendance-summary">
          <div>
            <span className="attendance-summary-number">
              {totals.operatives}
            </span>

            <span className="attendance-summary-label">
              Operatives
            </span>
          </div>

          <div>
            <span className="attendance-summary-number">
              {formatHours(totals.hours)}
            </span>

            <span className="attendance-summary-label">
              Total hours
            </span>
          </div>

          <div>
            <span className="attendance-summary-number">
              {formatHours(totals.backshiftHours)}
            </span>
            <span className="attendance-summary-label">
              Backshift hours
            </span>
          </div>

          <div>
            <span className="attendance-summary-number">
              {formatCurrency(totals.cost)}
            </span>

            <span className="attendance-summary-label">
              Total labour cost
            </span>
          </div>
        </section>

        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <label htmlFor="operative-search" style={{ display: "grid", gap: 6, width: "min(100%, 420px)", fontWeight: 600 }}>
            <span>Search operatives</span>
            <input id="operative-search" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name, company or trade..." style={{ width: "100%", minHeight: 42, padding: "8px 10px" }} />
          </label>

          <div className="attendance-filter" aria-label="Filter operatives by attendance status">
            {(["all", "on-site", "not-on-site"] as AttendanceFilter[]).map((filter) => (
              <button key={filter} type="button" className={`attendance-filter-button${attendanceFilter === filter ? " active" : ""}`} aria-pressed={attendanceFilter === filter} onClick={() => setAttendanceFilter(filter)}>
                {filter === "all" ? "All" : filter === "on-site" ? "On site" : "Not on site"}
              </button>
            ))}
          </div>
        </div>

        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Name</th>
                <th>Position</th>
                <th>Sign In</th>
                <th>Sign Out</th>
                <th>Hours</th>
                <th>Backshift</th>
                <th>Labour Rate</th>
                <th>Cost</th>
                <th aria-label="Actions" />
              </tr>
            </thead>

            <tbody>
              {attendanceRows.length > 0 ? (
                attendanceRows.map(
                  ({
                    operative,
                    record,
                    hours,
                    backshiftHours,
                    cost,
                    rateRule,
                    isOnSite,
                  }) => (
                    <tr key={operative.id}>
                      <td>{operative.company}</td>

                      <td>
                        <strong>{operative.name}</strong>
                        <span className={`attendance-row-status ${isOnSite ? "on-site" : "not-on-site"}`}>{isOnSite ? "On site" : "Not on site"}</span>
                      </td>

                      <td>{operative.position}</td>

                      <td>
                        <div className="attendance-time-control">
                          <input
                            type="time"
                            value={record?.signIn ?? ""}
                            onChange={(event) =>
                              updateAttendance(
                                operative,
                                "signIn",
                                event.target.value
                              )
                            }
                            aria-label={`Sign in time for ${operative.name}`}
                          />

                          {!record?.signIn && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() =>
                                signInNow(operative)
                              }
                            >
                              Now
                            </button>
                          )}
                        </div>
                      </td>

                      <td>
                        <div className="attendance-time-control">
                          <input
                            type="time"
                            value={record?.signOut ?? ""}
                            onChange={(event) =>
                              updateAttendance(
                                operative,
                                "signOut",
                                event.target.value
                              )
                            }
                            aria-label={`Sign out time for ${operative.name}`}
                          />

                          {record?.signIn &&
                            !record?.signOut && (
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() =>
                                  signOutNow(operative)
                                }
                              >
                                Now
                              </button>
                            )}
                        </div>
                      </td>

                      <td>{formatHours(hours)}</td>

                      <td>{formatHours(backshiftHours)}</td>

                      <td>
                        {formatCurrency(operative.hourlyRate)}
                        <small style={{ display: "block", color: "#5f6b76" }}>After {rateRule.backshiftStart}: {formatCurrency(operative.hourlyRate * rateRule.backshiftMultiplier)} ({rateRule.backshiftMultiplier}×)</small>
                      </td>

                      <td>{formatCurrency(cost)}</td>

                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => editOperative(operative)}
                          >
                            Edit details
                          </button>
                        {(record?.signIn ||
                          record?.signOut) && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() =>
                              clearRecord(
                                String(operative.id)
                              )
                            }
                          >
                            Clear
                          </button>
                        )}
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => markNotOnSite(operative)}
                            disabled={!record?.signIn || Boolean(record.signOut)}
                          >
                            Not on site
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => removeOperative(operative)}
                            style={{ color: "#b42318" }}
                          >
                            Remove person
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td colSpan={10}>
                    No operatives match the current search and status filter.
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot>
              <tr>
                <th colSpan={5}>Totals</th>
                <th>{formatHours(totals.hours)}</th>
                <th>{formatHours(totals.backshiftHours)}</th>
                <th />
                <th>{formatCurrency(totals.cost)}</th>
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </main>
  );
}
