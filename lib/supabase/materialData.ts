"use client";

import { calculateCallOff } from "@/lib/materialCallOff";
import { createClient } from "@/lib/supabase/client";
import type { ProgrammeActivity } from "@/types/site";

export type MaterialRequirement = {
  id: string;
  project_id: string;
  programme_activity_external_id: string;
  material: string;
  product_type?: string | null;
  supplier?: string | null;
  quantity?: number | null;
  unit?: string | null;
  required_on_site_date?: string | null;
  requirement_lead_time?: number | null;
  calculated_call_off_date?: string | null;
  previous_calculated_call_off_date?: string | null;
  programme_date_changed?: boolean;
  overridden_call_off_date?: string | null;
  override_reason?: string | null;
  overridden_by?: string | null;
  overridden_at?: string | null;
  actual_call_off_date?: string | null;
  confirmed_delivery_date?: string | null;
  actual_delivery_date?: string | null;
};
export type MaterialSettings = {
  project_default_lead_time?: number | null;
  internal_buffer: number;
  warning_period: number;
};
export type ProductDefault = {
  id?: string;
  product_type: string;
  lead_time: number;
};
export type SupplierProduct = {
  id?: string;
  supplier: string;
  material: string;
  lead_time: number;
};

export async function loadMaterialData(projectId: string) {
  const db = createClient();
  const [requirements, settings, defaults, supplierProducts] =
    await Promise.all([
      db
        .from("material_requirements")
        .select("*")
        .eq("project_id", projectId)
        .order("material"),
      db
        .from("material_call_off_settings")
        .select("project_default_lead_time,internal_buffer,warning_period")
        .eq("project_id", projectId)
        .maybeSingle(),
      db
        .from("material_product_type_defaults")
        .select("id,product_type,lead_time")
        .eq("project_id", projectId)
        .order("product_type"),
      db
        .from("material_supplier_products")
        .select("id,supplier,material,lead_time")
        .eq("project_id", projectId),
    ]);
  for (const result of [requirements, settings, defaults, supplierProducts])
    if (result.error) throw result.error;
  return {
    requirements: requirements.data as MaterialRequirement[],
    settings: (settings.data ?? {
      project_default_lead_time: null,
      internal_buffer: 0,
      warning_period: 5,
    }) as MaterialSettings,
    defaults: defaults.data as ProductDefault[],
    supplierProducts: supplierProducts.data as SupplierProduct[],
  };
}

export async function generateCallOffSchedule(
  projectId: string,
  activities: ProgrammeActivity[],
  today: string,
  settings: MaterialSettings,
  defaults: ProductDefault[],
  supplierProducts: SupplierProduct[],
  existing: MaterialRequirement[],
) {
  const db = createClient();
  const currentByKey = new Map(
    existing.map((row) => [
      `${row.programme_activity_external_id}|${row.material}`,
      row,
    ]),
  );
  const rows = activities.flatMap((activity) =>
    (activity.materialResourceNames ?? []).map((material) => {
      const current = currentByKey.get(
        `${activity.programmeActivityId}|${material}`,
      );
      const supplierLead = supplierProducts.find(
        (row) =>
          row.supplier === current?.supplier && row.material === material,
      )?.lead_time;
      const productLead = defaults.find(
        (row) => row.product_type === activity.productType,
      )?.lead_time;
      const calculated = calculateCallOff(
        {
          requiredOnSiteDate: current?.required_on_site_date ?? undefined,
          plannedStart: activity.plannedStart,
          requirementLeadTime: current?.requirement_lead_time ?? undefined,
          supplierProductLeadTime: supplierLead,
          productTypeLeadTime: productLead,
          projectLeadTime: settings.project_default_lead_time ?? undefined,
          internalBuffer: settings.internal_buffer,
          actualCallOffDate: current?.actual_call_off_date ?? undefined,
          confirmedDeliveryDate: current?.confirmed_delivery_date ?? undefined,
          actualDeliveryDate: current?.actual_delivery_date ?? undefined,
          overrideDate: current?.overridden_call_off_date ?? undefined,
        },
        today,
        settings.warning_period,
      );
      const moved = Boolean(
        current?.calculated_call_off_date &&
          calculated.calculatedDate &&
          current.calculated_call_off_date !== calculated.calculatedDate,
      );
      return {
        project_id: projectId,
        programme_activity_external_id: activity.programmeActivityId,
        material,
        product_type: current?.product_type || activity.productType || null,
        supplier: current?.supplier ?? null,
        quantity: current?.quantity ?? activity.plannedQuantity ?? null,
        unit: current?.unit || activity.unit || null,
        required_on_site_date: current?.required_on_site_date ?? null,
        requirement_lead_time: current?.requirement_lead_time ?? null,
        calculated_call_off_date: calculated.calculatedDate,
        previous_calculated_call_off_date: moved
          ? current?.calculated_call_off_date
          : (current?.previous_calculated_call_off_date ?? null),
        programme_date_changed: moved,
        overridden_call_off_date: current?.overridden_call_off_date ?? null,
        override_reason: current?.override_reason ?? null,
        overridden_by: current?.overridden_by ?? null,
        overridden_at: current?.overridden_at ?? null,
        actual_call_off_date: current?.actual_call_off_date ?? null,
        confirmed_delivery_date: current?.confirmed_delivery_date ?? null,
        actual_delivery_date: current?.actual_delivery_date ?? null,
        updated_at: new Date().toISOString(),
      };
    }),
  );
  if (rows.length) {
    const { error } = await db
      .from("material_requirements")
      .upsert(rows, {
        onConflict: "project_id,programme_activity_external_id,material",
      });
    if (error) throw error;
  }
  return rows.length;
}

export async function updateMaterialRequirement(
  id: string,
  changes: Partial<MaterialRequirement>,
) {
  const { error } = await createClient()
    .from("material_requirements")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
export async function saveMaterialSettings(
  projectId: string,
  settings: MaterialSettings,
) {
  const { data: user } = await createClient().auth.getUser();
  const { error } = await createClient()
    .from("material_call_off_settings")
    .upsert({
      project_id: projectId,
      ...settings,
      updated_by: user.user?.id,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}
export async function saveProductDefault(
  projectId: string,
  product_type: string,
  lead_time: number,
) {
  const { data: user } = await createClient().auth.getUser();
  const { error } = await createClient()
    .from("material_product_type_defaults")
    .upsert(
      {
        project_id: projectId,
        product_type,
        lead_time,
        updated_by: user.user?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,product_type" },
    );
  if (error) throw error;
}
export async function saveSupplierProduct(
  projectId: string,
  supplier: string,
  material: string,
  lead_time: number,
) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const { error } = await db
    .from("material_supplier_products")
    .upsert(
      {
        project_id: projectId,
        supplier,
        material,
        lead_time,
        updated_by: user.user?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,supplier,material" },
    );
  if (error) throw error;
}
