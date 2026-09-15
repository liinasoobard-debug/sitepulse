"use client";

import { useState } from "react";

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.3 21.3 0 0 1 5.06-6.06M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.4 21.4 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

type PasswordFieldProps = {
  label: string;
  name: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
};

export default function PasswordField({ label, name, autoComplete, minLength, required = true, value, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const controlled = onChange !== undefined;

  return (
    <label className="attendance-field">
      <span>{label}</span>
      <div className="password-field-wrapper">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          value={controlled ? value : undefined}
          onChange={controlled ? (event) => onChange(event.target.value) : undefined}
        />
        <button
          type="button"
          className="password-toggle-button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  );
}
