import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Play, Pause, TrendingUp, Target, CircleCheck, CircleAlert, CircleX } from "lucide-react";
import { api } from "../api.js";
import { toggleAudio, stopAudio } from "../audio.js";

function parseTurns(transcript, answers, interviewer) {
  const turns = [];
  const re = /\*\*(🤖 Interviewer \(chat\)|🤖 Interviewer|🤖 Final feedback|📝 You \(chat\)|📝 You):\*\*\s*/g;
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
        viaChat: label.includes("(chat)"),
        text,
        audio: interviewer.includes(name) ? name : null,
      });
    }
  }
  return turns;
}

const VERDICT = {
  strong: { icon: CircleCheck, cls: "verdict-strong" },
  average: { icon: CircleAlert, cls: "verdict-average" },
  weak: { icon: CircleX, cls: "verdict-weak" },
};

function VerdictChip({ verdict }) {
  const v = VERDICT[verdict] || VERDICT.average;
  const Icon = v.icon;
  return <span className={`verdict ${v.cls}`}><Icon size={12} /> {verdict}</span>;
}

function fmtMin(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

export default function SessionDetail({ day, sid, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("transcript");
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    api.session(day, sid).then(setData).catch((e) => setError(e.message));
  }, [day, sid]);

  // feedback.json + report.json arrive via background jobs — poll while missing
  useEffect(() => {
    if (!data || (data.feedback && data.report_json)) return;
    const t = setInterval(() => {
      api.session(day, sid).then(setData).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [data, day, sid]);

  useEffect(() => () => stopAudio(), []);

  const turns = useMemo(
    () => (data ? parseTurns(data.transcript, data.answers, data.interviewer) : []),
    [data]
  );

  const play = (name) => {
    const url = api.sessionAudioUrl(day, sid, name);
    toggleAudio(url, () => setPlaying((cur) => (cur === name ? null : cur)));
    setPlaying((cur) => (cur === name ? null : name));
  };

  if (error) return <div className="screen"><p className="error">{error}</p></div>;
  if (!data) return <div className="screen"><p className="muted">loading…</p></div>;

  const rj = data.report_json;
  const totals = rj?.totals;
  const tokens = rj?.tokens;
  const pacePct = totals ? Math.min(100, Math.round((totals.avg_wpm / 180) * 100)) : 0;
  const title = (data.transcript.split("\n")[0] || "Session review").replace(/^#\s*MockMan interview —\s*/, "");
  const pendingAnalysis = !data.feedback;
  const questions = data.feedback?.questions || [];

  return (
    <div className="screen">
      <div className="review-head">
        <div>
          <div className="eyebrow">Session review</div>
          <h1 className="page-title" style={{ fontSize: 34 }}>{title || "Session review"}</h1>
          <p className="sub">
            {day} · {turns.filter((t) => t.who === "you").length} answers
            {totals ? ` · ${fmtMin(totals.speaking_seconds)} speaking` : ""}
          </p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={onBack}><ArrowLeft size={15} /> Back to sessions</button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {[["transcript", "Transcript"], ["report", "Report"], ["questions", `Questions (${questions.length})`]].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "transcript" && (
        <div className="review-layout">
          <div className="panel">
            <div className="section-head" style={{ marginTop: 0 }}>
              <h2>Conversation</h2>
              <span className="small-muted">audio replay available</span>
            </div>
            <div className="transcript">
              {turns.map((t, i) => (
                <div key={i} className={`bubble ${t.who === "you" ? "user" : ""} ${t.who === "feedback" ? "feedback" : ""}`}>
                  <div className="bubble-head">
                    <span className="initial">{t.who === "you" ? "Y" : "R"}</span>
                    {t.who === "you" ? "You" : t.who === "feedback" ? "Riya · final feedback" : "Riya"}
                    {t.viaChat && <span className="small-muted">via board</span>}
                  </div>
                  <p>{t.text}</p>
                  {t.audio && (
                    <button className="play" onClick={() => play(t.audio)}>
                      {playing === t.audio
                        ? <><Pause size={11} /> Pause</>
                        : <><Play size={11} /> Replay {t.who === "you" ? "answer" : "question"}</>}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <aside className="panel">
            <h2>Session at a glance</h2>
            <p className="panel-intro">A quick read of your delivery.</p>
            <div className="metric-grid">
              <div className="metric"><strong>{totals ? fmtMin(totals.speaking_seconds) : "—"}</strong><span>Speaking time</span></div>
              <div className="metric"><strong>{totals?.avg_wpm ?? "—"}</strong><span>Words per minute</span></div>
              <div className="metric"><strong>{totals?.fillers ?? "—"}</strong><span>Filler words</span></div>
              <div className="metric"><strong>{rj ? rj.turns.length : "—"}</strong><span>Turns</span></div>
            </div>
            {totals && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>Speaking pace</span><strong>{totals.avg_wpm} WPM</strong>
                </div>
                <div className="progress"><span style={{ width: `${pacePct}%` }} /></div>
                <div className="small-muted" style={{ marginTop: 7 }}>
                  Benchmark: comfortable conversational range is 120–150 WPM.
                </div>
              </div>
            )}
            {data.feedback?.weak_points?.[0] && (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ fontSize: 13 }}>Coaching note</h3>
                <p className="sub" style={{ fontSize: 12 }}>{data.feedback.weak_points[0]}</p>
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === "report" && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="section-head" style={{ marginTop: 0 }}>
            <div>
              <h2>Speaking report</h2>
              <p className="panel-intro" style={{ margin: "5px 0 0" }}>
                A breakdown of answer delivery across this session.
              </p>
            </div>
            {rj ? <span className="chip">Report ready</span> : <span className="chip pending">Generating…</span>}
          </div>
          {rj ? (
            <>
              <div className="metric-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                <div className="metric"><strong>{fmtMin(totals.speaking_seconds)}</strong><span>Total answer audio</span></div>
                <div className="metric"><strong>{totals.words.toLocaleString()}</strong><span>Words spoken</span></div>
                <div className="metric"><strong>{totals.avg_wpm}</strong><span>Average WPM</span></div>
                <div className="metric"><strong>{totals.fillers}</strong><span>Filler words ({totals.fillers_per_min}/min)</span></div>
              </div>
              <div className="section-head"><h2>Per-turn metrics</h2></div>
              <div style={{ overflow: "auto" }}>
                <table className="metric-table">
                  <thead>
                    <tr><th>Turn</th><th>Audio length</th><th>Words</th><th>WPM</th><th>Fillers</th></tr>
                  </thead>
                  <tbody>
                    {rj.turns.map((t) => (
                      <tr key={t.turn}>
                        <td>{t.turn}</td>
                        <td>{fmtMin(t.seconds)}</td>
                        <td>{t.words}</td>
                        <td>{t.wpm}</td>
                        <td>{t.fillers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tokens && (
                <p className="small-muted">
                  tokens: {(tokens.input + tokens.output + tokens.reasoning).toLocaleString()}
                  {" "}({tokens.input.toLocaleString()} in / {tokens.output.toLocaleString()} out)
                  {" "}+ {tokens.cache_read.toLocaleString()} cache-read · est. cost ${rj.cost_usd?.toFixed(4)}
                </p>
              )}
            </>
          ) : (
            <pre className="report" style={{ background: "#f5f4ed", color: "var(--ink)" }}>
              {data.report || "report not generated yet"}
            </pre>
          )}
        </div>
      )}

      {tab === "questions" && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="section-head" style={{ marginTop: 0 }}>
            <div>
              <h2>Question-by-question analysis</h2>
              <p className="panel-intro" style={{ margin: "5px 0 0" }}>
                What went well, what to improve, and how to strengthen your answers.
              </p>
            </div>
            {pendingAnalysis
              ? <span className="chip pending">Analysis pending…</span>
              : <span className="chip">Analysis ready</span>}
          </div>
          {pendingAnalysis && <p className="muted">the analyzer is reading your transcript — this fills in automatically.</p>}
          {questions.map((q, i) => (
            <article className="question-item" key={i}>
              <div className="question-top">
                <strong>{i + 1}. {q.question}</strong>
                <VerdictChip verdict={q.verdict} />
              </div>
              <p>{q.answer_summary}</p>
              <div className="coach"><strong>Coaching note:</strong> {q.note}</div>
            </article>
          ))}
          {data.feedback && (
            <div className="strength-grid">
              <div className="strength">
                <h3><TrendingUp size={15} /> Strong points</h3>
                <ul>{data.feedback.strong_points.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div className="strength weakness">
                <h3><Target size={15} /> Areas to improve</h3>
                <ul>{data.feedback.weak_points.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
