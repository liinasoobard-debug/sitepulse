"use client";

type Props = {
  onAdd: (activity: string) => void;
};

export default function AddActivityModal({ onAdd }: Props) {
  return (
    <div
      style={{
        marginTop: 20,
        padding: 20,
        borderRadius: 16,
        background: "#f4f6f8",
      }}
    >
      <h2>Add Activity</h2>

      <button
        className="primary-button"
        onClick={() => onAdd("Installing Curtain Wall")}
      >
        Installing Curtain Wall
      </button>

      <button
        className="primary-button"
        style={{ marginTop: 10 }}
        onClick={() => onAdd("Waiting for Crane")}
      >
        Waiting for Crane
      </button>

      <button
        className="primary-button"
        style={{ marginTop: 10 }}
        onClick={() => onAdd("Break")}
      >
        Break
      </button>
    </div>
  );
}