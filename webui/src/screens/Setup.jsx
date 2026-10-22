import { useState } from "react";

const ROUND_TYPES = ["behavioral", "technical", "system design", "mixed"];

export default function Setup({ onBack, onContinue }) {
  const [role, setRole] = useState("Senior Backend Engineer");
  const [itype, setItype] = useState("mixed");
  const [context, setContext] = useState("");
  const [theme, setTheme] = useState("meet");

  return (
    <div className="setup">
      <h1>Set up your interview</h1>

      <label className="field">
        <span>Role</span>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Senior Backend Engineer"
        />
      </label>

      <div className="field">
        <span>Round type</span>
        <div className="pill-row">
          {ROUND_TYPES.map((t) => (
            <button
              key={t}
              className={`pill ${itype === t ? "pill-active" : ""}`}
              onClick={() => setItype(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Call platform</span>
        <div className="pill-row">
          <button
            className={`pill ${theme === "meet" ? "pill-active" : ""}`}
            onClick={() => setTheme("meet")}
          >
            Meet-style
          </button>
          <button className="pill pill-disabled" disabled title="Coming soon">
            Zoom-style (soon)
          </button>
        </div>
      </div>

      <label className="field">
        <span>Resume / job description (optional, pasted text)</span>
        <textarea
          rows={6}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Paste your resume and/or the target JD — questions will target it."
        />
      </label>

      <div className="row">
        <button className="btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn-primary"
          disabled={!role.trim()}
          onClick={() =>
            onContinue({ role: role.trim(), itype, context, theme, persona: "interviewer" })
          }
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
