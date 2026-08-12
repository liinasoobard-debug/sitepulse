export const materialImportFields = [
  "materialCode",
  "description",
  "productType",
  "package",
  "supplier",
  "orderReference",
  "poNumber",
  "quantity",
  "unit",
  "orderDate",
  "requiredOnSite",
  "leadTime",
  "callOffDate",
  "confirmedDelivery",
  "actualDelivery",
  "programmeActivityId",
  "building",
  "elevation",
  "level",
  "status",
  "notes",
] as const;
export type MaterialImportField = (typeof materialImportFields)[number];
export type MaterialColumnMapping = Partial<
  Record<MaterialImportField, string>
>;
export type MaterialImportRow = Record<string, unknown>;
export type MaterialImportClassification =
  | "NEW"
  | "UPDATED"
  | "UNCHANGED"
  | "UNMATCHED"
  | "INVALID";

const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<MaterialImportField, string[]> = {
  materialCode: ["material code", "item code", "sku"],
  description: ["description", "material", "item description"],
  productType: ["product type", "product"],
  package: ["package", "work package"],
  supplier: ["supplier", "vendor"],
  orderReference: ["order reference", "order ref"],
  poNumber: ["po number", "purchase order", "po"],
  quantity: ["ordered quantity", "quantity", "qty"],
  unit: ["unit", "uom"],
  orderDate: ["order date", "po date"],
  requiredOnSite: ["required on site", "required date", "ros date"],
  leadTime: ["lead time", "lead time days"],
  callOffDate: ["call-off date", "call off date"],
  confirmedDelivery: ["confirmed delivery", "confirmed delivery date"],
  actualDelivery: ["actual delivery", "delivered date"],
  programmeActivityId: ["programme activity id", "activity id", "task id"],
  building: ["building"],
  elevation: ["elevation", "area"],
  level: ["level", "floor"],
  status: ["status"],
  notes: ["notes", "comments"],
};
export function suggestMaterialMapping(
  headers: string[],
): MaterialColumnMapping {
  const result: MaterialColumnMapping = {};
  for (const field of materialImportFields) {
    const match = headers.find((header) =>
      aliases[field].some((alias) => normalized(alias) === normalized(header)),
    );
    if (match) result[field] = match;
  }
  return result;
}
export function mapMaterialRow(
  row: MaterialImportRow,
  mapping: MaterialColumnMapping,
) {
  const get = (field: MaterialImportField) => text(row[mapping[field] ?? ""]);
  return {
    material_code: get("materialCode") || null,
    material: get("description"),
    product_type: get("productType") || null,
    package: get("package") || null,
    supplier: get("supplier") || null,
    order_reference: get("orderReference") || null,
    po_number: get("poNumber") || null,
    quantity: get("quantity") === "" ? null : Number(get("quantity")),
    unit: get("unit") || null,
    order_date: get("orderDate") || null,
    required_on_site_date: get("requiredOnSite") || null,
    requirement_lead_time:
      get("leadTime") === "" ? null : Number(get("leadTime")),
    actual_call_off_date: get("callOffDate") || null,
    confirmed_delivery_date: get("confirmedDelivery") || null,
    actual_delivery_date: get("actualDelivery") || null,
    programme_activity_external_id: get("programmeActivityId"),
    building: get("building") || null,
    elevation: get("elevation") || null,
    level: get("level") || null,
    explicit_status: get("status") || null,
    notes: get("notes") || null,
  };
}
export function materialStableKey(row: ReturnType<typeof mapMaterialRow>) {
  return row.programme_activity_external_id && row.material_code
    ? `activity:${row.programme_activity_external_id}|code:${row.material_code}`
    : row.po_number && row.material_code
      ? `po:${row.po_number}|code:${row.material_code}`
      : row.order_reference && row.material_code
        ? `order:${row.order_reference}|code:${row.material_code}`
        : "";
}
export function classifyMaterialImport(
  row: ReturnType<typeof mapMaterialRow>,
  existing?: Record<string, unknown>,
  activityExists = true,
): MaterialImportClassification {
  if (
    !row.material ||
    !materialStableKey(row) ||
    !Number.isFinite(row.quantity ?? 0)
  )
    return "INVALID";
  if (row.programme_activity_external_id && !activityExists) return "UNMATCHED";
  if (!existing) return "NEW";
  const protectedKeys = new Set(["site_notes", "actual_delivery_date"]);
  const changed = Object.entries(row).some(
    ([key, value]) =>
      !protectedKeys.has(key) &&
      String(existing[key] ?? "") !== String(value ?? ""),
  );
  return changed ? "UPDATED" : "UNCHANGED";
}
