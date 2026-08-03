"use client";

import { createClient } from "@/lib/supabase/client";

export const SHARED_STATE_TABLE = "sitepulse_shared_state";
export const SHARED_SYNC_EVENT = "sitepulse-shared-data-changed";

const SHARED_KEY_PREFIXES = [
  "sitepulse-projects",
  "sitepulse-operatives",
  "sitepulse-programme-project-",
  "sitepulse-day-project-",
];
const CLIENT_ID_KEY = "sitepulse-sync-client-id";
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

export type SharedStateRow = {
  record_key: string;
  payload: unknown;
  client_id: string;
  updated_at: string;
};

export function isSharedStorageKey(key: string): boolean {
  return SHARED_KEY_PREFIXES.some((prefix) =>
    prefix.endsWith("-") ? key.startsWith(prefix) : key === prefix
  );
}

export function getSyncClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

export function getLocalSharedRecords(): Map<string, unknown> {
  const records = new Map<string, unknown>();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !isSharedStorageKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    try {
      records.set(key, JSON.parse(value));
    } catch {
      // Ignore malformed legacy browser data rather than uploading it.
    }
  }
  return records;
}

export function applyRemoteRecord(record: SharedStateRow): void {
  localStorage.setItem(record.record_key, JSON.stringify(record.payload));
  window.dispatchEvent(
    new CustomEvent(SHARED_SYNC_EVENT, {
      detail: { recordKey: record.record_key },
    })
  );
}

async function writeSharedRecord(key: string, payload: unknown): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from(SHARED_STATE_TABLE).upsert({
    record_key: key,
    payload,
    client_id: getSyncClientId(),
  });
  if (error) console.error(`Unable to sync ${key}:`, error.message);
}

export function queueSharedWrite(key: string, payload: unknown): void {
  if (typeof window === "undefined" || !isSharedStorageKey(key)) return;
  const pending = pendingWrites.get(key);
  if (pending) clearTimeout(pending);
  pendingWrites.set(
    key,
    setTimeout(() => {
      pendingWrites.delete(key);
      void writeSharedRecord(key, payload);
    }, 150)
  );
}

export async function deleteSharedRecord(key: string): Promise<void> {
  if (!isSharedStorageKey(key)) return;
  const supabase = createClient();
  const { error } = await supabase
    .from(SHARED_STATE_TABLE)
    .delete()
    .eq("record_key", key);
  if (error) console.error(`Unable to remove synced record ${key}:`, error.message);
}
