import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { toggleAudio, stopAudio } from "../audio.js";

// Parse transcript.md turns like "**🤖 Interviewer:** text" into chat entries,
// attaching audio by sequence: k-th interviewer entry -> interviewer_{k}.wav,
// k-th candidate entry -> answer_{k}.wav (attached only if the file exists).
function parseTurns(transcript, answers, interviewer) {
  const turns = [];
  const re = /\*\*(🤖 Interviewer|🤖 Final feedback|📝 You):\*\*\s*/g;
  const parts = transcript.split(re).filter(Boolean);
  let aIdx = 0;
  let iIdx = 0;
  for (let i = 0; i < parts.length - 1; i += 2) {
    const label = parts[i];
    const text = parts[i + 1].trim();
    if (label.startsWith("📝")) {
      aIdx += 1;
      const name = `answer_${aIdx}.wav`;
      turns.push({ who: "you", text, audio: answers.includes(name) ? name : null });
    } else {
      iIdx += 1;
      const name = `interviewer_${iIdx}.wav`;
      turns.push({
        who: label.includes("Final") ? "feedback" : "interviewer",
        text,
        audio: interviewer.includes(name) ? name : null,
      });
    }
  }
  return turns;
}

const VERDICT_ICON = { strong: "🟢", average: "🟡", weak: "🔴" };

export default function SessionDetail({ day, sid, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("transcript");
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    api.session(day, sid).then(setData).catch((e) => setError(e.message));
  }, [day, sid]);

  // feedback.json arrives via a background job — poll while missing
  useEffect(() => {
    if (!data || data.feedback) return;
    const t = setInterval(() => {
      api.session(day, sid).then(setData).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [data, day, sid]);

  const turns = useMemo(
    () => (data ? parseTurns(data.transcript, data.answers, data.interviewer) : []),
    [data]
  );

  // stop whatever is playing when leaving the screen
  useEffect(() => () => stopAudio(), []);

  const play = (name) => {
    const url = api.sessionAudioUrl(day, sid, name);
    toggleAudio(url, () => setPlaying((cur) => (cur === name ? null : cur)));
    setPlaying((cur) => (cur === name ? null : name));
  };

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><p className="muted">loading…</p></div>;

  return (
    <div className="page">
      <div className="row spread">
        <button className="btn-ghost" onClick={onBack}>← Dashboard</button>
        <span className="muted small">{day} · {sid.slice(0, 12)}…</span>
      </div>

      <div className="pill-row tabs">
        {["transcript", "report", "feedback"].map((t) => (
          <button
            key={t}
            className={`pill ${tab === t ? "pill-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "feedback"
              ? `questions ${data.feedback ? `(${data.feedback.questions.length})` : "…"}`
              : t}
          </button>
        ))}
      </div>

      {tab === "transcript" && (
        <div className="chat">
          {turns.map((t, i) => (
            <div key={i} className={`bubble bubble-${t.who}`}>
              <div className="bubble-text">{t.text}</div>
              {t.audio && (
                <button className="replay" onClick={() => play(t.audio)}>
                  {playing === t.audio ? "⏸ playing…" : "▶ replay"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "report" && (
        <pre className="report">{data.report || "report not generated"}</pre>
      )}

      {tab === "feedback" && (
        <div className="feedback-list">
          {!data.feedback && <p className="muted">analysis still generating…</p>}
          {data.feedback?.questions.map((q, i) => (
            <div key={i} className="q-card">
              <div className="q-head">
                <span>{VERDICT_ICON[q.verdict] || "⚪"}</span>
                <b>{q.question}</b>
              </div>
              <p className="muted">{q.answer_summary}</p>
              <p className="q-note">{q.note}</p>
            </div>
          ))}
          {data.feedback && (
            <div className="sw-grid">
              <div>
                <h3>💪 strong points</h3>
                <ul>{data.feedback.strong_points.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <h3>🎯 weak points</h3>
                <ul>{data.feedback.weak_points.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
