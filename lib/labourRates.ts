import type { LabourRateRule, LabourRateSettings } from "@/types/site";

export const DEFAULT_LABOUR_RATE_SETTINGS: LabourRateSettings = {
  backshiftStart: "17:00",
  backshiftMultiplier: 1.5,
  companyRules: [],
};

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validMultiplier(value: unknown): value is number {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function normaliseLabourRateSettings(settings?: Partial<LabourRateSettings>): LabourRateSettings {
  return {
    backshiftStart: validTime(settings?.backshiftStart) ? settings.backshiftStart : DEFAULT_LABOUR_RATE_SETTINGS.backshiftStart,
    backshiftMultiplier: validMultiplier(settings?.backshiftMultiplier) ? Number(settings?.backshiftMultiplier) : DEFAULT_LABOUR_RATE_SETTINGS.backshiftMultiplier,
    companyRules: Array.isArray(settings?.companyRules) ? settings.companyRules.flatMap((rule) => {
      const company = rule?.company?.trim();
      if (!company) return [];
      return [{
        company,
        backshiftStart: validTime(rule.backshiftStart) ? rule.backshiftStart : DEFAULT_LABOUR_RATE_SETTINGS.backshiftStart,
        backshiftMultiplier: validMultiplier(rule.backshiftMultiplier) ? Number(rule.backshiftMultiplier) : DEFAULT_LABOUR_RATE_SETTINGS.backshiftMultiplier,
      }];
    }) : [],
  };
}

export function labourRateRuleForCompany(settings: LabourRateSettings, company: string): LabourRateRule {
  const override = settings.companyRules.find((rule) => rule.company.trim().toLowerCase() === company.trim().toLowerCase());
  return override ?? settings;
}

function minutes(time?: string): number | null {
  if (!validTime(time)) return null;
  const [hours, minute] = time.split(":").map(Number);
  return hours * 60 + minute;
}

export function calculateLabourRateBreakdown(signIn: string | undefined, signOut: string | undefined, hourlyRate: number, rule: LabourRateRule) {
  const start = minutes(signIn);
  const rawFinish = minutes(signOut);
  const threshold = minutes(rule.backshiftStart);
  if (start === null || rawFinish === null || threshold === null) {
    return { normalHours: 0, backshiftHours: 0, totalHours: 0, normalCost: 0, backshiftCost: 0, totalCost: 0 };
  }
  const finish = rawFinish < start ? rawFinish + 24 * 60 : rawFinish;
  const effectiveThreshold = start >= threshold ? start : threshold;
  const normalMinutes = Math.max(0, Math.min(finish, effectiveThreshold) - start);
  const backshiftMinutes = Math.max(0, finish - Math.max(start, threshold));
  const normalHours = normalMinutes / 60;
  const backshiftHours = backshiftMinutes / 60;
  const normalCost = normalHours * hourlyRate;
  const backshiftCost = backshiftHours * hourlyRate * rule.backshiftMultiplier;
  return { normalHours, backshiftHours, totalHours: normalHours + backshiftHours, normalCost, backshiftCost, totalCost: normalCost + backshiftCost };
}
