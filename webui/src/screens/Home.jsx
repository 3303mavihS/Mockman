import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Home({ onNewInterview, onOpenSession, onSettings }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.sessions().then(setSessions).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="home">
      <header className="home-header">
        <h1>🎙️ MockMan</h1>
        <div className="row">
          <button className="btn-ghost" onClick={onSettings}>⚙️ Settings</button>
          <button className="btn-primary" onClick={onNewInterview}>
            + New interview
          </button>
        </div>
      </header>
      <h2>Past sessions</h2>
      {error && <p className="error">backend unreachable: {error}</p>}
      {!error && sessions.length === 0 && (
        <p className="muted">No sessions yet — start your first interview.</p>
      )}
      <div className="session-grid">
        {sessions.map((s) => (
          <button
            className="session-card"
            key={s.id}
            onClick={() => onOpenSession(s.day, s.id)}
          >
            <div className="session-title">{s.title}</div>
            <div className="session-meta">
              <span>{s.day}</span>
              <span>{s.turns} turns</span>
              <span>{Math.round(s.audio_seconds / 60)} min</span>
              {s.has_report && <span className="chip">report ✓</span>}
              {s.has_feedback && <span className="chip chip-blue">analysis ✓</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
