import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api.js";
import { toast } from "../toast.js";

// split a persona file into editable fields; reassemble preserving frontmatter
function splitPersona(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { description: "", role: "", body: raw };
  const fm = m[1];
  return {
    description: ((fm.match(/^description:\s*(.+)$/m) || [])[1] || "").trim(),
    role: ((fm.match(/^role:\s*(.+)$/m) || [])[1] || "").trim(),
    body: m[2],
  };
}
function joinPersona(raw, { description, role, body }) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = m ? m[1] : "mode: primary";
  const lines = fm
    .split("\n")
    .filter((l) => !l.startsWith("description:") && !l.startsWith("role:"));
  lines.splice(0, 0, `description: ${description || "Custom interviewer persona"}`);
  if (role) lines.splice(1, 0, `role: ${role}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

const NEW_PERSONA_TEMPLATE = (name) => `---
description: Custom interviewer persona.
role: Technical Interviewer
mode: primary
temperature: 0.7
permission:
  edit: deny
  bash: deny
  read: deny
  write: deny
  glob: deny
  grep: deny
  list: deny
  task: deny
  webfetch: deny
  websearch: deny
---

You are ${name}, an interviewer. Ask one question at a time, keep every reply
short and spoken-style (it is read aloud), probe vague answers for specifics,
and give structured feedback when the candidate says "end the interview".
`;

const ACCENTS = {
  "Electric chartreuse": "#d4f36a",
  "Signal coral": "#f2845c",
};

function applyAccent(name) {
  const color = ACCENTS[name] || ACCENTS["Electric chartreuse"];
  document.documentElement.style.setProperty("--lime", color);
}

export default function Settings() {
  const [tab, setTab] = useState("personas");
  const [personas, setPersonas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [raw, setRaw] = useState("");
  const [fields, setFields] = useState({ description: "", role: "", body: "" });
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [appearance, setAppearance] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("mockman.appearance")) || {};
    } catch { return {}; }
  });

  const loadPersonas = () =>
    api.personas().then(setPersonas).catch((e) => toast(`error: ${e.message}`));

  useEffect(() => {
    loadPersonas().then(() => {});
    api.profile().then((p) => { setResume(p.resume || ""); setJd(p.jd || ""); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected && personas.length) select(personas[0].id);
  }, [personas]);

  useEffect(() => {
    if (appearance.accent) applyAccent(appearance.accent);
    localStorage.setItem("mockman.appearance", JSON.stringify(appearance));
  }, [appearance]);

  const select = (id) => {
    setSelected(id);
    api.persona(id).then((p) => {
      setRaw(p.content);
      setFields(splitPersona(p.content));
    }).catch(() => {});
  };

  const savePersona = () => {
    api.updatePersona(selected, joinPersona(raw, fields))
      .then(() => { toast("Persona saved — applies next interview"); loadPersonas(); })
      .catch((e) => toast(`error: ${e.message}`));
  };

  const saveProfile = () => {
    api.updateProfile(resume, jd)
      .then(() => toast("Resume profile saved"))
      .catch((e) => toast(`error: ${e.message}`));
  };

  const saveAll = () => {
    if (tab === "personas" && selected) savePersona();
    else if (tab === "resume") saveProfile();
    else toast("Appearance applied");
  };

  const resetPersona = () => {
    api.personaDefault(selected)
      .then((d) => {
        api.updatePersona(selected, d.content).then(() => {
          toast("Persona reset to default");
          select(selected);
        });
      })
      .catch(() => toast("No factory default for this persona"));
  };

  const addPersona = () => {
    const name = window.prompt("Name this interviewer persona (e.g. Bar Raiser):");
    if (!name?.trim()) return;
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    api.updatePersona(id, NEW_PERSONA_TEMPLATE(name.trim()))
      .then(() => { toast(`Persona "${name}" created`); loadPersonas().then(() => select(id)); })
      .catch((e) => toast(`error: ${e.message}`));
  };

  const deletePersona = () => {
    if (!window.confirm(`Delete persona "${selected}"?`)) return;
    api.deletePersona(selected)
      .then(() => {
        toast("Persona deleted");
        setSelected(null);
        loadPersonas();
      })
      .catch((e) => toast(`error: ${e.message}`));
  };

  const pick = (group, value) => {
    setAppearance((a) => ({ ...a, [group]: value }));
    if (group !== "accent") toast("Noted — only accent color is wired so far");
  };

  return (
    <div className="screen">
      <div className="title-row">
        <div>
          <div className="eyebrow">Workspace preferences</div>
          <h1 className="page-title">Settings</h1>
          <p className="sub">Shape your interviewer, manage your saved profile, and tune your workspace.</p>
        </div>
        <button className="btn primary" onClick={saveAll}>Save changes ↗</button>
      </div>

      <div className="settings-tabs">
        {[["personas", "Interviewer personas"], ["resume", "Resume profile"], ["appearance", "Appearance"]].map(([id, label]) => (
          <button key={id} className={`settings-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "personas" && (
        <div className="settings-layout">
          <div className="panel">
            <div className="section-head" style={{ marginTop: 0 }}>
              <h2>Your personas</h2>
              <button className="link-button" onClick={addPersona}>
                <Plus size={13} style={{ verticalAlign: -2 }} /> Add
              </button>
            </div>
            <p className="panel-intro">Choose the interviewer style you want to practice with.</p>
            <div className="persona-list">
              {personas.map((p) => (
                <button
                  key={p.id}
                  className={`persona ${selected === p.id ? "active" : ""}`}
                  onClick={() => select(p.id)}
                >
                  <span className="avatar-mini">{p.id[0].toUpperCase()}</span>
                  <span><strong>{p.id}</strong><small>{p.description || "custom persona"}</small></span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            {selected ? (
              <>
                <div className="persona-heading">
                  <span className="avatar-mini">{selected[0].toUpperCase()}</span>
                  <div>
                    <h3>{selected}</h3>
                    <p>{fields.description || "custom interviewer persona"}</p>
                  </div>
                  <span className="spacer" />
                  <span className="chip">Selected</span>
                </div>
                <div className="field">
                  <label>Interviewer role</label>
                  <input
                    value={fields.role}
                    onChange={(e) => setFields((f) => ({ ...f, role: e.target.value }))}
                    placeholder="e.g. Technical Interviewer"
                  />
                </div>
                <div className="field">
                  <label>Persona instructions (Markdown)</label>
                  <textarea
                    className="codearea"
                    value={fields.body}
                    onChange={(e) => setFields((f) => ({ ...f, body: e.target.value }))}
                    spellCheck={false}
                  />
                  <div className="helper">
                    Persona instructions are used for future interview sessions. Keep the prompt specific and easy to evaluate.
                  </div>
                </div>
                <div className="toolbar">
                  <button className="btn" onClick={resetPersona}>Reset to default</button>
                  <button
                    className="btn danger"
                    onClick={deletePersona}
                    disabled={selected === "interviewer"}
                    title={selected === "Interviewer" ? "the default persona is protected" : "delete this persona"}
                  >
                    Delete persona
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">no personas found</p>
            )}
          </div>
        </div>
      )}

      {tab === "resume" && (
        <div className="panel">
          <h2>Saved resume profile</h2>
          <p className="panel-intro">
            This information pre-fills the setup screen for new interviews. You can still customize it for each session.
          </p>
          <div className="field">
            <label htmlFor="profile-resume">Resume / professional background</label>
            <textarea
              id="profile-resume"
              style={{ minHeight: 280 }}
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="Paste your resume here once…"
            />
            <div className="helper">
              Add your target role, years of experience, strongest skills, projects, and achievements to make practice sessions more relevant.
            </div>
          </div>
          <div className="field">
            <label htmlFor="profile-jd">Target job description (optional)</label>
            <textarea
              id="profile-jd"
              style={{ minHeight: 180 }}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste a job description here to tailor future interview sessions…"
            />
          </div>
          <button className="btn primary" onClick={saveProfile}>Save resume profile</button>
        </div>
      )}

      {tab === "appearance" && (
        <div className="panel">
          <h2>Appearance</h2>
          <p className="panel-intro">
            A focused workspace for preparation, with a separate dark environment during live interviews.
          </p>
          <div className="field">
            <label>Dashboard and review theme</label>
            <div className="options">
              {["Warm light", "Dark"].map((o) => (
                <button
                  key={o}
                  className={`option ${(appearance.theme || "Warm light") === o ? "selected" : ""}`}
                  onClick={() => pick("theme", o)}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Accent color</label>
            <div className="options">
              {Object.keys(ACCENTS).map((o) => (
                <button
                  key={o}
                  className={`option ${(appearance.accent || "Electric chartreuse") === o ? "selected" : ""}`}
                  onClick={() => pick("accent", o)}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Interview room</label>
            <div className="options">
              {["Dark studio", "Follow system"].map((o) => (
                <button
                  key={o}
                  className={`option ${(appearance.room || "Dark studio") === o ? "selected" : ""}`}
                  onClick={() => pick("room", o)}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <p className="helper">Accent color applies immediately; theme and interview-room variants are coming soon.</p>
        </div>
      )}
    </div>
  );
}
