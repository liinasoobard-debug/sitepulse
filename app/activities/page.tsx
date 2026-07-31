"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addActivity,
  deleteActivity,
  loadActivities,
  updateActivity,
} from "@/lib/storage";
import type { Activity } from "@/types/site";

type ActivityForm = {
  code: string;
  description: string;
  location: string;
  unit: string;
  plannedQuantity: string;
};

const emptyForm: ActivityForm = {
  code: "",
  description: "",
  location: "",
  unit: "",
  plannedQuantity: "",
};

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [form, setForm] = useState<ActivityForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setActivities(loadActivities());
  }, []);

  const filteredActivities = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activities;

    return activities.filter((activity) =>
      [
        activity.code,
        activity.description,
        activity.location,
        activity.unit,
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [activities, search]);

  function updateForm(field: keyof ActivityForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
  }

  function submitActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.code.trim()) {
      setError("Enter an activity code.");
      return;
    }

    if (!form.description.trim()) {
      setError("Enter an activity description.");
      return;
    }

    const plannedQuantity = Number(form.plannedQuantity) || 0;

    if (editingId) {
      const existingActivity = activities.find(
        (activity) => activity.id === editingId
      );

      if (!existingActivity) return;

      setActivities(
        updateActivity({
          ...existingActivity,
          code: form.code.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          unit: form.unit.trim(),
          plannedQuantity,
        })
      );

      resetForm();
      return;
    }

    const duplicateCode = activities.some(
      (activity) =>
        activity.code.trim().toLowerCase() ===
        form.code.trim().toLowerCase()
    );

    if (duplicateCode) {
      setError("This activity code already exists.");
      return;
    }

    setActivities(
      addActivity({
        code: form.code.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        unit: form.unit.trim(),
        plannedQuantity,
      })
    );

    resetForm();
  }

  function startEditing(activity: Activity) {
    setEditingId(activity.id);
    setForm({
      code: activity.code,
      description: activity.description,
      location: activity.location,
      unit: activity.unit,
      plannedQuantity:
        activity.plannedQuantity > 0
          ? String(activity.plannedQuantity)
          : "",
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeActivity(activity: Activity) {
    const confirmed = window.confirm(
      `Delete ${activity.code} — ${activity.description}?`
    );

    if (!confirmed) return;

    setActivities(deleteActivity(activity.id));

    if (editingId === activity.id) {
      resetForm();
    }
  }

  return (
    <main className="timeline-page">
      <section className="timeline-panel">
        <header className="timeline-header">
          <div>
            <p className="eyebrow">Project Setup</p>
            <h1>Activities</h1>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/crews" className="secondary-button">
              Gangs
            </Link>

            <Link href="/timeline" className="secondary-button">
              Timeline
            </Link>
          </div>
        </header>

        <form
          onSubmit={submitActivity}
          style={{
            display: "grid",
            gap: 14,
            marginBottom: 24,
            padding: 20,
            border: "1px solid #d7dde3",
            borderRadius: 18,
            background: "#f7f9fa",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>
              {editingId ? "Edit Activity" : "Add Activity"}
            </h2>
            <p style={{ margin: "6px 0 0", color: "#5f6b76" }}>
              Create the planned activities that site gangs will record against.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <label className="attendance-field">
              <span>Activity code *</span>
              <input
                type="text"
                value={form.code}
                onChange={(event) => updateForm("code", event.target.value)}
                placeholder="e.g. CW-001"
              />
            </label>

            <label className="attendance-field">
              <span>Description *</span>
              <input
                type="text"
                value={form.description}
                onChange={(event) =>
                  updateForm("description", event.target.value)
                }
                placeholder="e.g. Install curtain wall"
              />
            </label>

            <label className="attendance-field">
              <span>Location</span>
              <input
                type="text"
                value={form.location}
                onChange={(event) =>
                  updateForm("location", event.target.value)
                }
                placeholder="e.g. North Elevation L01"
              />
            </label>

            <label className="attendance-field">
              <span>Unit</span>
              <input
                type="text"
                value={form.unit}
                onChange={(event) => updateForm("unit", event.target.value)}
                placeholder="e.g. m², nr, lm"
              />
            </label>

            <label className="attendance-field">
              <span>Planned quantity</span>
              <input
                type="number"
                min="0"
                step="any"
                value={form.plannedQuantity}
                onChange={(event) =>
                  updateForm("plannedQuantity", event.target.value)
                }
                placeholder="0"
              />
            </label>
          </div>

          {error && (
            <p role="alert" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" className="add-event-button" style={{ margin: 0 }}>
              {editingId ? "Save Changes" : "Add Activity"}
            </button>

            {editingId && (
              <button type="button" className="secondary-button" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <strong>
            {activities.length} activit{activities.length === 1 ? "y" : "ies"}
          </strong>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search activities"
            style={{
              width: "100%",
              maxWidth: 320,
              minHeight: 42,
              padding: "9px 12px",
              border: "1px solid #ccd3da",
              borderRadius: 10,
            }}
          />
        </div>

        {activities.length === 0 ? (
          <section
            style={{
              padding: 28,
              border: "1px dashed #b9c2ca",
              borderRadius: 18,
              background: "#f7f9fa",
              textAlign: "center",
            }}
          >
            <h2 style={{ marginTop: 0 }}>No activities added yet</h2>
            <p>Add the first planned activity using the form above.</p>
          </section>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredActivities.map((activity) => (
              <article
                key={activity.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(100px, 0.7fr) minmax(220px, 2fr) repeat(2, minmax(90px, 1fr)) auto",
                  gap: 14,
                  alignItems: "center",
                  padding: 16,
                  border: "1px solid #d7dde3",
                  borderRadius: 14,
                  background: "#ffffff",
                }}
              >
                <strong>{activity.code}</strong>

                <div>
                  <strong style={{ display: "block" }}>
                    {activity.description}
                  </strong>
                  {activity.location && (
                    <span
                      style={{
                        display: "block",
                        marginTop: 4,
                        color: "#5f6b76",
                        fontSize: 13,
                      }}
                    >
                      {activity.location}
                    </span>
                  )}
                </div>

                <span>{activity.unit || "—"}</span>
                <span>{activity.plannedQuantity || "—"}</span>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => startEditing(activity)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => removeActivity(activity)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {activities.length > 0 && filteredActivities.length === 0 && (
          <p>No activities match your search.</p>
        )}
      </section>
    </main>
  );
}
