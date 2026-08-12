export const plantImportFields = [
  "plantType",
  "description",
  "supplier",
  "hireReference",
  "quantity",
  "onHireDate",
  "requiredFrom",
  "requiredTo",
  "offHireRequested",
  "actualOffHire",
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
  plantType: ["plant type", "type"],
  description: ["description", "plant description"],
  supplier: ["supplier", "hire company"],
  hireReference: ["hire reference", "hire ref", "contract number"],
  quantity: ["quantity", "qty"],
  onHireDate: ["on-hire date", "on hire date"],
  requiredFrom: ["required from", "required from date"],
  requiredTo: ["required to", "required to date"],
  offHireRequested: ["off-hire requested", "off hire requested"],
  actualOffHire: ["actual off-hire", "actual off hire"],
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
  return {
    plant_type: get("plantType"),
    description: get("description") || null,
    supplier: get("supplier") || null,
    hire_reference: get("hireReference"),
    quantity: get("quantity") === "" ? 1 : Number(get("quantity")),
    on_hire_date: get("onHireDate") || null,
    required_from_date: get("requiredFrom") || null,
    required_to_date: get("requiredTo") || null,
    off_hire_requested_date: get("offHireRequested") || null,
    actual_off_hire_date: get("actualOffHire") || null,
    programme_activity_external_id: get("programmeActivityId") || null,
    building: get("building") || null,
    elevation: get("elevation") || null,
    level: get("level") || null,
    explicit_status: get("status") || null,
    notes: get("notes") || null,
  };
}
export const plantStableKey = (row: ReturnType<typeof mapPlantRow>) =>
  row.hire_reference && row.plant_type
    ? `hire:${row.hire_reference}|type:${row.plant_type}`
    : "";
export function classifyPlantImport(
  row: ReturnType<typeof mapPlantRow>,
  existing?: Record<string, unknown>,
  activityExists = true,
): PlantClassification {
  if (!row.plant_type || !plantStableKey(row) || !Number.isFinite(row.quantity))
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
