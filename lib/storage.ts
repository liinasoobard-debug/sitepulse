import type { Operative, SiteDay } from "@/types/site";
import { operatives as defaultOperatives } from "@/lib/operatives";

export const STORAGE_KEY = "sitepulse-day";
export const OPERATIVES_STORAGE_KEY = "sitepulse-operatives";

export function loadDay(): SiteDay | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const data = localStorage.getItem(STORAGE_KEY);

    return data ? (JSON.parse(data) as SiteDay) : null;
  } catch (error) {
    console.error("Unable to load the site day:", error);
    return null;
  }
}

export function saveDay(data: SiteDay): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Unable to save the site day:", error);
  }
}

export function loadOperatives(): Operative[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const savedData = localStorage.getItem(
      OPERATIVES_STORAGE_KEY
    );

    if (savedData) {
      const parsedData = JSON.parse(savedData);

      if (Array.isArray(parsedData)) {
        return parsedData as Operative[];
      }
    }

    saveOperatives(defaultOperatives);

    return defaultOperatives;
  } catch (error) {
    console.error("Unable to load operatives:", error);
    return defaultOperatives;
  }
}

export function saveOperatives(
  operatives: Operative[]
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(
      OPERATIVES_STORAGE_KEY,
      JSON.stringify(operatives)
    );
  } catch (error) {
    console.error("Unable to save operatives:", error);
  }
}

export function addOperative(
  operative: Operative
): Operative[] {
  const existingOperatives = loadOperatives();

  const operativeAlreadyExists = existingOperatives.some(
    (existingOperative) =>
      existingOperative.id === operative.id
  );

  if (operativeAlreadyExists) {
    return existingOperatives;
  }

  const updatedOperatives = [
    ...existingOperatives,
    operative,
  ];

  saveOperatives(updatedOperatives);

  return updatedOperatives;
}

export function updateOperative(
  updatedOperative: Operative
): Operative[] {
  const existingOperatives = loadOperatives();

  const updatedOperatives = existingOperatives.map(
    (operative) =>
      operative.id === updatedOperative.id
        ? updatedOperative
        : operative
  );

  saveOperatives(updatedOperatives);

  return updatedOperatives;
}

export function deleteOperative(
  operativeId: string
): Operative[] {
  const existingOperatives = loadOperatives();

  const updatedOperatives = existingOperatives.filter(
    (operative) => operative.id !== operativeId
  );

  saveOperatives(updatedOperatives);

  return updatedOperatives;
}