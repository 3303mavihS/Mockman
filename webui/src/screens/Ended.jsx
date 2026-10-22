import { ArrowLeft, CircleCheck, ChevronRight, PhoneOff } from "lucide-react";

export default function Ended({ result, onHome, onReview }) {
  const [day, sid] = result?.session?.split("/") ?? [];
  return (
    <div className="ended screen">
      <div className="ended-badge">
        {result?.discarded ? <PhoneOff size={28} /> : <CircleCheck size={28} />}
      </div>
      <h1>Call ended</h1>
      {result?.discarded ? (
        <div className="feedback-card">
          <h2>No answers recorded</h2>
          <p className="muted">
            you joined but didn't answer anything, so the session was closed
            without feedback — nothing saved.
          </p>
        </div>
      ) : (
        <>
          <p className="muted small">
            {result?.session ? `session: ${result.session}` : ""}
          </p>
          <div className="feedback-card">
            <h2>Feedback & report</h2>
            <p className="muted">
              being generated in the background — open the review in a few
              seconds and they'll fill in (spoken feedback, metrics report,
              question-by-question analysis).
            </p>
          </div>
        </>
      )}
      <div className="row">
        <button className="btn-ghost" onClick={onHome}>
          <ArrowLeft size={16} /> Back to dashboard
        </button>
        {!result?.discarded && day && sid && (
          <button className="btn-primary" onClick={() => onReview(day, sid)}>
            Review session <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
