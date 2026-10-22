import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api.js";
import { toast } from "../toast.js";

// split a persona file into editable description + prompt body
function splitPersona(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { description: "", body: raw };
  const desc = (m[1].match(/^description:\s*(.+)$/m) || [])[1] || "";
  return { description: desc.trim(), body: m[2] };
}
function joinPersona(raw, description, body) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = m ? m[1] : "mode: primary";
  const lines = fm.split("\n").filter((l) => !l.startsWith("description:"));
  lines.splice(0, 0, `description: ${description || "Custom interviewer persona"}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

const NEW_PERSONA_TEMPLATE = (name) => `---
description: Custom interviewer persona.
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

export default function Settings() {
  const [tab, setTab] = useState("personas");
  const [personas, setPersonas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [raw, setRaw] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [resume, setResume] = useState("");

  const loadPersonas = () =>
    api.personas().then((list) => {
      setPersonas(list);
      return list;
    }).catch((e) => toast(`error: ${e.message}`));

  useEffect(() => {
    loadPersonas().then((list) => {
      if (list?.length) select(list[0].id);
    });
    api.profile().then((p) => setResume(p.resume)).catch(() => {});
  }, []);

  const select = (id) => {
    setSelected(id);
    api.persona(id).then((p) => {
      setRaw(p.content);
      const parts = splitPersona(p.content);
      setDescription(parts.description);
      setBody(parts.body);
    }).catch(() => {});
  };

  const savePersona = () => {
    api.updatePersona(selected, joinPersona(raw, description, body))
      .then(() => { toast("Persona saved — applies next interview"); loadPersonas(); })
      .catch((e) => toast(`error: ${e.message}`));
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
        loadPersonas().then((list) => list?.length && select(list[0].id));
      })
      .catch((e) => toast(`error: ${e.message}`));
  };

  return (
    <div className="screen">
      <div className="title-row">
        <div>
          <div className="eyebrow">Workspace preferences</div>
          <h1 className="page-title">Settings</h1>
          <p className="sub">Customize your interview experience and saved profile.</p>
        </div>
      </div>

      <div className="settings-tabs">
        {[["personas", "Interviewer personas"], ["resume", "Resume profile"]].map(([id, label]) => (
          <button key={id} className={`settings-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "personas" && (
        <div className="settings-layout">
          <div className="panel">
            <div className="section-head" style={{ marginTop: 0 }}>
              <h2>Personas</h2>
              <button className="link-button" onClick={addPersona}>
                <Plus size={13} style={{ verticalAlign: -2 }} /> Add
              </button>
            </div>
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
                    <p>agent file: .opencode/agent/{selected}.md</p>
                  </div>
                  <span className="spacer" />
                  <span className="chip">Selected</span>
                </div>
                <div className="field">
                  <label>Description</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="field">
                  <label>Persona instructions (markdown)</label>
                  <textarea className="codearea" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
                  <div className="helper">Changes take effect on the next interview. The body is the system prompt.</div>
                </div>
                <div className="toolbar">
                  <button className="btn primary" onClick={savePersona}>Save persona</button>
                  <span className="spacer" />
                  <button
                    className="btn danger"
                    onClick={deletePersona}
                    disabled={selected === "interviewer"}
                    title={selected === "interviewer" ? "the default persona is protected" : "delete this persona"}
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
            This content prefills the setup screen for new interviews. You can still edit it per session.
          </p>
          <div className="field">
            <label htmlFor="profile-resume">Resume / background</label>
            <textarea
              id="profile-resume"
              style={{ minHeight: 260 }}
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="Paste your resume here once…"
            />
          </div>
          <div>
            <button
              className="btn primary"
              onClick={() =>
                api.updateProfile(resume)
                  .then(() => toast("Resume profile saved"))
                  .catch((e) => toast(`error: ${e.message}`))
              }
            >
              Save resume profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
