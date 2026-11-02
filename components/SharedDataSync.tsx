"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  applyRemoteRecord,
  getLocalSharedRecords,
  getSyncClientId,
  SHARED_STATE_TABLE,
  type SharedStateRow,
} from "@/lib/sharedSync";
import { ACTIVE_PROJECT_STORAGE_KEY, PROJECTS_STORAGE_KEY, getActiveProjectId, loadProjects } from "@/lib/storage";
import { loadAccessibleProjects } from "@/lib/supabase/projectData";

type SyncStatus = "connecting" | "synced" | "offline" | "setup-required";

export default function SharedDataSync({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(!configured);
  const [status, setStatus] = useState<SyncStatus>(
    configured ? "connecting" : "setup-required"
  );

  useEffect(() => {
    if (!configured) return;

    const supabase = createClient();
    const clientId = getSyncClientId();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    async function startSync() {
      // 1. Project list comes from the RLS-protected projects table only.
      try {
        const projects = await loadAccessibleProjects();
        if (!active) return;
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
        const storedActive = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
        const firstLive = projects.find((project) => !project.isArchived) ?? projects[0];
        if (firstLive && !projects.some((project) => project.id === storedActive && !project.isArchived)) {
          localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, firstLive.id);
        }
        if (!projects.length) {
          localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
          console.warn("No SitePulse projects are available for this account.");
        }
      } catch (caught) {
        console.error(caught instanceof Error ? caught.message : caught);
        setStatus("offline");
        setReady(true);
        return;
      }

      // 2. Per-project shared records (operatives and site days).
      const projectId = loadProjects().length ? getActiveProjectId() : "";
      if (!projectId) {
        setStatus("synced");
        setReady(true);
        return;
      }
      const operativeKey = `sitepulse-operatives-project-${projectId}`;
      const dayPrefix = `sitepulse-day-project-${projectId}-%`;
      const { data, error } = await supabase
        .from(SHARED_STATE_TABLE)
        .select("record_key,payload,client_id,updated_at")
        .or(`record_key.eq.${operativeKey},record_key.like.${dayPrefix}`);

      if (!active) return;
      if (error) {
        console.error("Unable to start shared data sync:", error.message);
        setStatus(error.code === "42P01" ? "setup-required" : "offline");
        setReady(true);
        return;
      }

      const remoteRecords = (data ?? []) as SharedStateRow[];
      const localRecords = getLocalSharedRecords(projectId);

      if (remoteRecords.length === 0 && localRecords.size > 0) {
        const seedRows = [...localRecords].map(([record_key, payload]) => ({
          record_key,
          payload,
          client_id: clientId,
        }));
        const { error: seedError } = await supabase
          .from(SHARED_STATE_TABLE)
          .upsert(seedRows);
        if (seedError) console.error("Unable to upload existing SitePulse data:", seedError.message);
      } else {
        remoteRecords.forEach(applyRemoteRecord);
      }

      if (!active) return;
      setStatus("synced");
      setReady(true);

      channel = supabase
        .channel("sitepulse-shared-state")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: SHARED_STATE_TABLE },
          (change) => {
            if (change.eventType === "DELETE") {
              const oldRecord = change.old as Partial<SharedStateRow>;
              if (oldRecord.record_key && localStorage.getItem(oldRecord.record_key) !== null) {
                localStorage.removeItem(oldRecord.record_key);
                window.location.reload();
              }
              return;
            }
            const record = change.new as SharedStateRow;
            if (record.client_id === clientId) return;
            if (applyRemoteRecord(record)) window.location.reload();
          }
        )
        .subscribe((subscriptionStatus) => {
          if (!active) return;
          if (subscriptionStatus === "SUBSCRIBED") setStatus("synced");
          if (subscriptionStatus === "CHANNEL_ERROR" || subscriptionStatus === "TIMED_OUT") {
            setStatus("offline");
          }
        });
    }

    void startSync();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [configured]);

  if (!ready) {
    return <main className="app-shell"><p>Connecting to shared SitePulse data…</p></main>;
  }

  const label = status === "synced"
    ? "Shared data synced"
    : status === "offline"
      ? "Working offline"
      : "Supabase database setup required";

  return <><div className={`sync-status sync-status-${status}`} role="status">{label}</div>{children}</>;
}
