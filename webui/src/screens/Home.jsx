import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api.js";

export default function Home({ onOpenSession }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.sessions().then(setSessions).catch((e) => setError(e.message));
  }, []);

  const totalMin = Math.round(sessions.reduce((n, s) => n + s.audio_seconds, 0) / 60);
  const avgMin = sessions.length ? Math.round(totalMin / sessions.length) : 0;

  return (
    <div className="screen">
      <div className="title-row">
        <div className="title-copy">
          <div className="eyebrow">Practice with purpose</div>
          <h1 className="page-title">Ready when you are.</h1>
          <p className="sub">
            {sessions.length
              ? "Your practice history, all in one place."
              : "No sessions yet — your practice history will live here."}
          </p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Total sessions</div>
          <div className="stat-value">{sessions.length}</div>
          <div className="stat-note">Across your practice history</div>
        </div>
        <div className="stat">
          <div className="stat-label">Speaking time</div>
          <div className="stat-value">{totalMin} min</div>
          <div className="stat-note">Time spent answering aloud</div>
        </div>
        <div className="stat">
          <div className="stat-label">Average session</div>
          <div className="stat-value">{avgMin} min</div>
          <div className="stat-note">Across saved sessions</div>
        </div>
      </div>

      <div className="section-head">
        <h2>Recent sessions</h2>
      </div>
      {error && <p className="error">backend unreachable: {error}</p>}
      <div className="session-list">
        {sessions.map((s) => {
          const [, mm, dd] = s.day.split("-");
          const month = new Date(s.day + "T00:00:00").toLocaleString("en", { month: "short" });
          return (
            <button className="session-card" key={s.id} onClick={() => onOpenSession(s.day, s.id)}>
              <div className="date-badge"><strong>{dd}</strong><span>{month}</span></div>
              <div>
                <div className="session-title">{s.title}</div>
                <div className="session-meta">
                  {s.turns} turns · {Math.round(s.audio_seconds / 60)} min
                </div>
              </div>
              <div className="chips">
                {s.has_report && <span className="chip">Report ready</span>}
                {s.has_feedback
                  ? <span className="chip">Analysis ready</span>
                  : s.has_report && <span className="chip pending">Analysis pending</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
