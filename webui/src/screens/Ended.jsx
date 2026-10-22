import { CircleCheck, CircleAlert, ArrowLeft, ChevronRight, Sparkles } from "lucide-react";

function fmtDuration(seconds) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Ended({ result, onHome, onReview, onNewInterview }) {
  const [day, sid] = result?.session?.split("/") ?? [];
  const discarded = result?.discarded;

  return (
    <div className="screen">
      <div className="end-content">
        {discarded ? (
          <div className="panel endcard">
            <div className="end-symbol empty"><CircleAlert size={30} /></div>
            <p className="eyebrow warn">SESSION NOT SAVED</p>
            <h1>Nothing to review this time.</h1>
            <p className="sub">
              The interview ended before any answers were recorded. No review has
              been generated, and this session won't count toward your practice history.
            </p>
            <div className="end-summary">
              <div className="end-metric">
                <label>Duration</label>
                <div><strong>{fmtDuration(result?.duration_seconds)}</strong><small>Time in interview</small></div>
              </div>
              <div className="end-metric">
                <label>Answers</label>
                <div><strong>0</strong><small>Responses captured</small></div>
              </div>
              <div className="end-metric">
                <label>Review</label>
                <div><strong className="end-metric-sm">Unavailable</strong><small>No answer data</small></div>
              </div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={onNewInterview}>
                Try another interview ↗
              </button>
              <button className="btn" onClick={onHome}>Back to dashboard</button>
            </div>
            <div className="end-note">
              <span className="i"><Sparkles size={16} /></span>
              <div>
                <strong>Ready when you are</strong>
                <p>Take a breath, check your microphone, and start again when you're comfortable. Your next session is a fresh start.</p>
              </div>
            </div>
            <p className="end-footnote">No answers or transcript were saved for this session.</p>
          </div>
        ) : (
          <div className="panel endcard">
            <div className="end-symbol"><CircleCheck size={30} /></div>
            <p className="eyebrow">SESSION COMPLETE</p>
            <h1>Good work. Let's make it count.</h1>
            <p className="sub">
              Your interview is in the books. We're turning your answers into a
              useful review, with specific feedback you can put into practice.
            </p>
            <div className="end-summary">
              <div className="end-metric">
                <label>Duration</label>
                <div><strong>{fmtDuration(result?.duration_seconds)}</strong><small>Interview time</small></div>
              </div>
              <div className="end-metric">
                <label>Questions</label>
                <div><strong>{result?.answers ?? "—"}</strong><small>Responses captured</small></div>
              </div>
              <div className="end-metric">
                <label>Review status</label>
                <div><strong className="end-metric-sm">Processing</strong><small>Preparing your feedback</small></div>
              </div>
            </div>
            <div className="row">
              {day && sid && (
                <button className="btn primary" onClick={() => onReview(day, sid)}>
                  View session review <ChevronRight size={15} />
                </button>
              )}
              <button className="btn" onClick={onHome}>Back to dashboard</button>
            </div>
            <div className="end-note">
              <span className="i"><Sparkles size={16} /></span>
              <div>
                <strong>Your review is being prepared</strong>
                <p>We'll analyze your responses, communication patterns, and answer structure. This usually takes a short moment.</p>
              </div>
            </div>
            <p className="end-footnote">You can leave this page. Your session will remain in your history.</p>
          </div>
        )}
      </div>
    </div>
  );
}
