import { CircleCheck, ArrowLeft, ChevronRight, Delete } from "lucide-react";

export default function Ended({ result, onHome, onReview }) {
  const [day, sid] = result?.session?.split("/") ?? [];
  return (
    <div className="screen">
      <div className="title-row">
        <div>
          <div className="eyebrow">Session complete</div>
          <h1 className="page-title">Interview ended.</h1>
          <p className="sub">Choose what you'd like to do next.</p>
        </div>
      </div>

      <div className="call-ended-grid">
        {result?.discarded ? (
          <div className="ended-card discarded">
            <div className="ended-icon"><Delete size={24} /></div>
            <h2>Nothing saved</h2>
            <p>You ended the interview without submitting a voice or chat answer, so this session wasn't saved.</p>
            <div className="side-note" style={{ margin: "5px 0 20px" }}>
              <strong style={{ fontSize: 12 }}>No responses recorded</strong>
              <p style={{ margin: "5px 0 0" }}>Your dashboard remains unchanged.</p>
            </div>
            <div className="ended-actions">
              <button className="btn primary" onClick={onHome}>
                <ArrowLeft size={15} /> Back to dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="ended-card">
            <div className="ended-icon"><CircleCheck size={24} /></div>
            <h2>Interview completed</h2>
            <p>Your session has ended. Feedback and your report are being generated in the background.</p>
            <div className="steps">
              <div className="process-step done"><span className="check">●</span>Processing your answers</div>
              <div className="process-step done"><span className="check">●</span>Generating spoken feedback</div>
              <div className="process-step done"><span className="check">●</span>Creating session report</div>
              <div className="process-step pending"><span className="check">◌</span>Analyzing your answers</div>
            </div>
            <div className="ended-actions">
              {day && sid && (
                <button className="btn primary" onClick={() => onReview(day, sid)}>
                  Review session <ChevronRight size={15} />
                </button>
              )}
              <button className="btn" onClick={onHome}>Back to dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
