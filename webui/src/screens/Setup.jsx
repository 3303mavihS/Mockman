import { useEffect, useState } from "react";
import { api } from "../api.js";

const ROUND_TYPES = ["behavioral", "technical", "system design", "mixed"];

export default function Setup({ onBack, onContinue }) {
  const [role, setRole] = useState("Senior Backend Engineer");
  const [itype, setItype] = useState("mixed");
  const [context, setContext] = useState("");
  const [theme, setTheme] = useState("meet");
  const [personas, setPersonas] = useState([]);
  const [persona, setPersona] = useState("interviewer");

  // prefill context from the saved profile (resume + target JD), still editable
  useEffect(() => {
    api.profile().then((p) => {
      const parts = [];
      if (p.resume) parts.push(p.resume);
      if (p.jd) parts.push(`Target job description:\n${p.jd}`);
      if (parts.length) setContext(parts.join("\n\n"));
    }).catch(() => {});
    api.personas().then(setPersonas).catch(() => {});
  }, []);

  return (
    <div className="screen">
      <div className="title-row">
        <div>
          <div className="eyebrow">New interview</div>
          <h1 className="page-title">Let's set up your interview.</h1>
          <p className="sub">Give Riya the context to make this practice session relevant.</p>
        </div>
      </div>

      <div className="stepper">
        <div className="step active"><span>1</span> Setup</div>
        <div className="step-line" />
        <div className="step"><span>2</span> Green room</div>
        <div className="step-line" />
        <div className="step"><span>3</span> Join</div>
      </div>

      <div className="form-layout">
        <div className="panel">
          <h2>Interview details</h2>
          <p className="panel-intro">These details shape the questions and interviewer behavior.</p>

          <div className="field">
            <label htmlFor="role">Role</label>
            <input
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Frontend Engineer"
            />
          </div>

          <div className="field">
            <label>Interviewer persona</label>
            <div className="options">
              {personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`option ${persona === p.id ? "selected" : ""}`}
                  onClick={() => setPersona(p.id)}
                  title={p.description}
                >
                  {p.id}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Round type</label>
            <div className="options">
              {ROUND_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`option ${itype === t ? "selected" : ""}`}
                  onClick={() => setItype(t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Call platform theme</label>
            <div className="choice-grid">
              <button
                type="button"
                className={`platform-choice ${theme === "meet" ? "selected" : ""}`}
                onClick={() => setTheme("meet")}
              >
                <span className="platform-icon">M</span>
                <span><strong>Google Meet style</strong><small>Simple, spacious controls</small></span>
              </button>
              <button
                type="button"
                className={`platform-choice ${theme === "zoom" ? "selected" : ""}`}
                onClick={() => setTheme("zoom")}
              >
                <span className="platform-icon">Z</span>
                <span><strong>Zoom style</strong><small>Toolbar and problem panel</small></span>
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="resume">Resume / Job description</label>
            <textarea
              id="resume"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Paste your resume or job description here…"
            />
            <div className="helper">
              Prefilled from your saved profile. You can edit it for each interview.
            </div>
          </div>

          <div className="form-footer">
            <button type="button" className="btn" onClick={onBack}>Cancel</button>
            <button
              type="button"
              className="btn primary"
              disabled={!role.trim()}
              onClick={() =>
                onContinue({ role: role.trim(), itype, context, theme, persona })
              }
            >
              Continue to green room →
            </button>
          </div>
        </div>

        <aside className="side-note">
          <h3>Make it feel real.</h3>
          <p>A little context helps Riya ask better, more relevant questions.</p>
          <ul>
            <li>Use the exact role you're targeting.</li>
            <li>Include a job description for tailored questions.</li>
            <li>Choose the round you want to practice.</li>
          </ul>
          <hr style={{ border: 0, borderTop: "1px solid #d5dfbd", margin: "16px 0" }} />
          <h3>Before you join</h3>
          <p>Your camera and microphone can be checked in the green room. The interview begins only when you explicitly join.</p>
        </aside>
      </div>
    </div>
  );
}
