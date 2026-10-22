import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Home({ onNewInterview }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.sessions().then(setSessions).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="home">
      <header className="home-header">
        <h1>🎙️ MockMan</h1>
        <button className="btn-primary" onClick={onNewInterview}>
          + New interview
        </button>
      </header>
      <h2>Past sessions</h2>
      {error && <p className="error">backend unreachable: {error}</p>}
      {!error && sessions.length === 0 && (
        <p className="muted">No sessions yet — start your first interview.</p>
      )}
      <div className="session-grid">
        {sessions.map((s) => (
          <div className="session-card" key={s.id}>
            <div className="session-title">{s.title}</div>
            <div className="session-meta">
              <span>{s.day}</span>
              <span>{s.turns} turns</span>
              <span>{Math.round(s.audio_seconds / 60)} min</span>
              {s.has_report && <span className="chip">report ✓</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
