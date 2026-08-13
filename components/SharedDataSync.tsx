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
import { ACTIVE_PROJECT_STORAGE_KEY, getActiveProjectId, loadProjects } from "@/lib/storage";
import type { Project } from "@/types/site";

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
      const localProjects = loadProjects();
      const projectId = localProjects.length ? getActiveProjectId() : "";
      const operativeKey = `sitepulse-operatives-project-${projectId}`;
      const dayPrefix = `sitepulse-day-project-${projectId}-%`;
      let remoteQuery = supabase.from(SHARED_STATE_TABLE).select("record_key,payload,client_id,updated_at");
      remoteQuery = projectId
        ? remoteQuery.or(`record_key.eq.sitepulse-projects,record_key.eq.${operativeKey},record_key.like.${dayPrefix}`)
        : remoteQuery.eq("record_key", "sitepulse-projects");
      const { data, error } = await remoteQuery;

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

      const { data: memberships, error: membershipError } = await supabase
        .from("sitepulse_project_members")
        .select("project_id")
        .order("project_id");
      if (membershipError) {
        console.error("Unable to recover project memberships:", membershipError.message);
      } else {
        const accessibleIds = [...new Set((memberships ?? []).map((row) => String(row.project_id)))];
        const stored = loadProjects();
        const validStored = stored.filter((project) => accessibleIds.includes(project.id));
        const missingIds = accessibleIds.filter((id) => !validStored.some((project) => project.id === id));
        if (missingIds.length) {
          const recovered: Project[] = missingIds.map((id, index) => ({
            id,
            name: accessibleIds.length === 1 ? "Test Project" : `Recovered Project ${index + 1}`,
            code: accessibleIds.length === 1 ? "TEST-001" : `REC-${id.slice(0, 6).toUpperCase()}`,
            createdAt: new Date().toISOString(),
          }));
          const projects = [...validStored, ...recovered];
          localStorage.setItem("sitepulse-projects", JSON.stringify(projects));
          localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projects[0].id);
          const { error: recoveryError } = await supabase.from(SHARED_STATE_TABLE).upsert({
            record_key: "sitepulse-projects",
            payload: projects,
            client_id: clientId,
          });
          if (recoveryError) console.error("Unable to persist recovered project list:", recoveryError.message);
        }
      }

      // A fresh hostname has no local project context. Do not manufacture and
      // upload a default project before the authoritative shared list arrives.
      if (!loadProjects().length && !remoteRecords.some((row) => row.record_key === "sitepulse-projects")) {
        console.warn("No shared SitePulse project list is available for this account.");
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
