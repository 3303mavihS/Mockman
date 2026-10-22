import { useEffect, useState } from "react";
import { Mic, Plus, Settings as SettingsIcon, Clock, ChevronRight, FileText, BrainCircuit } from "lucide-react";
import { api } from "../api.js";

export default function Home({ onNewInterview, onOpenSession, onSettings }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.sessions().then(setSessions).catch((e) => setError(e.message));
  }, []);

  const totalMin = Math.round(
    sessions.reduce((n, s) => n + s.audio_seconds, 0) / 60
  );

  return (
    <div className="home screen">
      <header className="home-header">
        <div className="logo">
          <div className="logo-badge"><Mic size={20} /></div>
          MockMan
        </div>
        <div className="row">
          <button className="btn-ghost" onClick={onSettings}>
            <SettingsIcon size={16} /> Settings
          </button>
          <button className="btn-primary" onClick={onNewInterview}>
            <Plus size={16} /> New interview
          </button>
        </div>
      </header>
      <p className="home-tag">
        {sessions.length
          ? `${sessions.length} session${sessions.length > 1 ? "s" : ""} · ${totalMin} min practiced`
          : "your personal interview gym"}
      </p>

      <h2>PAST SESSIONS</h2>
      {error && <p className="error">backend unreachable: {error}</p>}
      {!error && sessions.length === 0 && (
        <p className="muted">No sessions yet — start your first interview.</p>
      )}
      <div className="session-grid">
        {sessions.map((s) => {
          const [, mm, dd] = s.day.split("-");
          const month = new Date(s.day).toLocaleString("en", { month: "short" });
          return (
            <button
              className="session-card"
              key={s.id}
              onClick={() => onOpenSession(s.day, s.id)}
            >
              <div className="session-date-badge">
                <b>{dd}</b>
                <span>{month}</span>
              </div>
              <div className="session-body">
                <div className="session-title">{s.title}</div>
                <div className="session-meta">
                  <span className="mi"><Mic size={13} /> {s.turns} turns</span>
                  <span className="mi"><Clock size={13} /> {Math.round(s.audio_seconds / 60)} min</span>
                  {s.has_report && <span className="chip"><FileText size={11} /> report</span>}
                  {s.has_feedback && <span className="chip chip-blue"><BrainCircuit size={11} /> analysis</span>}
                </div>
              </div>
              <ChevronRight className="go" size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
