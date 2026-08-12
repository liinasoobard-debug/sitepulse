export const plantImportFields = [
  "recordKind",
  "plantType",
  "description",
  "assetNumber",
  "supplier",
  "hireReference",
  "quantity",
  "onHireDate",
  "arrivalDate",
  "requiredFrom",
  "requiredTo",
  "bookingRequiredBy",
  "actualBookingDate",
  "confirmedDeliveryDate",
  "offHireRequested",
  "actualOffHire",
  "dailyHireRate",
  "weeklyHireRate",
  "programmeActivityId",
  "building",
  "elevation",
  "level",
  "status",
  "notes",
] as const;
export type PlantImportField = (typeof plantImportFields)[number];
export type PlantMapping = Partial<Record<PlantImportField, string>>;
export type PlantImportRow = Record<string, unknown>;
export type PlantClassification =
  | "NEW"
  | "UPDATED"
  | "UNCHANGED"
  | "UNMATCHED"
  | "INVALID";
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, ""),
  text = (v: unknown) => String(v ?? "").trim();
const aliases: Record<PlantImportField, string[]> = {
  recordKind: ["record kind", "record type", "plant record type"],
  plantType: ["plant type", "type"],
  description: ["description", "plant description"],
  assetNumber: ["asset number", "fleet number", "asset / fleet number"],
  supplier: ["supplier", "hire company"],
  hireReference: ["hire reference", "hire ref", "contract number"],
  quantity: ["quantity", "qty"],
  onHireDate: ["on-hire date", "on hire date"],
  arrivalDate: ["arrival date", "delivery / arrival date", "delivery date"],
  requiredFrom: ["required from", "required from date"],
  requiredTo: ["required to", "required to date"],
  bookingRequiredBy: ["call-off required by", "booking required by"],
  actualBookingDate: ["actual call-off / booking date", "actual booking date", "call-off date"],
  confirmedDeliveryDate: ["confirmed delivery date", "confirmed delivery"],
  offHireRequested: ["off-hire requested", "off hire requested"],
  actualOffHire: ["actual off-hire", "actual off hire"],
  dailyHireRate: ["daily hire rate", "daily rate", "daily hire cost"],
  weeklyHireRate: ["weekly hire rate", "weekly rate", "weekly hire cost"],
  programmeActivityId: ["programme activity id", "activity id", "task id"],
  building: ["building"],
  elevation: ["elevation", "area"],
  level: ["level", "floor"],
  status: ["status"],
  notes: ["notes", "comments"],
};
export function suggestPlantMapping(headers: string[]): PlantMapping {
  const result: PlantMapping = {};
  for (const field of plantImportFields) {
    const match = headers.find((header) =>
      aliases[field].some((alias) => norm(alias) === norm(header)),
    );
    if (match) result[field] = match;
  }
  return result;
}
export function mapPlantRow(row: PlantImportRow, mapping: PlantMapping) {
  const get = (field: PlantImportField) => text(row[mapping[field] ?? ""]);
  const recordKind = get("recordKind").toUpperCase();
  return {
    record_kind: recordKind === "REQUIREMENT" ? "REQUIREMENT" as const : "HIRE" as const,
    plant_type: get("plantType"),
    description: get("description") || null,
    asset_number: get("assetNumber") || null,
    supplier: get("supplier") || null,
    hire_reference: get("hireReference"),
    quantity: get("quantity") === "" ? 1 : Number(get("quantity")),
    on_hire_date: get("onHireDate") || null,
    arrival_date: get("arrivalDate") || null,
    required_from_date: get("requiredFrom") || null,
    required_to_date: get("requiredTo") || null,
    booking_required_by: get("bookingRequiredBy") || null,
    actual_booking_date: get("actualBookingDate") || null,
    confirmed_delivery_date: get("confirmedDeliveryDate") || null,
    off_hire_requested_date: get("offHireRequested") || null,
    actual_off_hire_date: get("actualOffHire") || null,
    daily_hire_cost: get("dailyHireRate") === "" ? null : Number(get("dailyHireRate")),
    weekly_hire_cost: get("weeklyHireRate") === "" ? null : Number(get("weeklyHireRate")),
    programme_activity_external_id: get("programmeActivityId") || null,
    building: get("building") || null,
    elevation: get("elevation") || null,
    level: get("level") || null,
    explicit_status: get("status") || null,
    notes: get("notes") || null,
  };
}
export const plantStableKey = (row: ReturnType<typeof mapPlantRow>) =>
  row.record_kind === "REQUIREMENT"
    ? row.plant_type && row.required_from_date
      ? `requirement:${row.programme_activity_external_id || "project"}|type:${row.plant_type}|from:${row.required_from_date}`
      : ""
    : row.plant_type && (row.hire_reference || row.asset_number)
      ? `hire:${row.hire_reference || row.asset_number}|type:${row.plant_type}`
      : "";
export function classifyPlantImport(
  row: ReturnType<typeof mapPlantRow>,
  existing?: Record<string, unknown>,
  activityExists = true,
): PlantClassification {
  if (
    !row.plant_type ||
    !plantStableKey(row) ||
    !Number.isFinite(row.quantity) ||
    (row.daily_hire_cost !== null && !Number.isFinite(row.daily_hire_cost)) ||
    (row.weekly_hire_cost !== null && !Number.isFinite(row.weekly_hire_cost))
  )
    return "INVALID";
  if (row.programme_activity_external_id && !activityExists) return "UNMATCHED";
  if (!existing) return "NEW";
  const changed = Object.entries(row).some(
    ([key, value]) =>
      key !== "site_notes" &&
      String(existing[key] ?? "") !== String(value ?? ""),
  );
  return changed ? "UPDATED" : "UNCHANGED";
}
