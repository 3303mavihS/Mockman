import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "../api.js";

export default function Settings({ onBack }) {
  const [personas, setPersonas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState("");
  const [resume, setResume] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    api.personas().then((list) => {
      setPersonas(list);
      if (list.length) select(list[0].id);
    }).catch((e) => setStatus(`error: ${e.message}`));
    api.profile().then((p) => setResume(p.resume)).catch(() => {});
  }, []);

  const select = (id) => {
    setSelected(id);
    api.persona(id).then((p) => setContent(p.content)).catch(() => {});
  };

  const flash = (msg) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), 2500);
  };

  return (
    <div className="page narrow screen">
      <div className="row spread">
        <h1>Settings</h1>
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Dashboard
        </button>
      </div>
      {status && <p className="muted">{status}</p>}

      <section className="card">
        <h2>Interviewer persona</h2>
        <div className="pill-row">
          {personas.map((p) => (
            <button
              key={p.id}
              className={`pill ${selected === p.id ? "pill-active" : ""}`}
              onClick={() => select(p.id)}
              title={p.description}
            >
              {p.id}
            </button>
          ))}
        </div>
        <textarea
          className="persona-editor"
          rows={16}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
        />
        <div className="row">
          <button
            className="btn-primary"
            onClick={() =>
              api.updatePersona(selected, content)
                .then(() => flash("persona saved ✓"))
                .catch((e) => flash(`error: ${e.message}`))
            }
          >
            Save persona
          </button>
          <span className="muted small">takes effect on the next interview</span>
        </div>
      </section>

      <section className="card">
        <h2>Resume / JD (reused in every interview)</h2>
        <textarea
          className="persona-editor"
          rows={8}
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          placeholder="Paste your resume here once — every new interview prefills from it."
        />
        <div className="row">
          <button
            className="btn-primary"
            onClick={() =>
              api.updateProfile(resume)
                .then(() => flash("resume saved ✓"))
                .catch((e) => flash(`error: ${e.message}`))
            }
          >
            Save resume
          </button>
          <span className="muted small">stored locally only (gitignored)</span>
        </div>
      </section>
    </div>
  );
}
