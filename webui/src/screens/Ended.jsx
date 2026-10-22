export default function Ended({ result, onHome, onReview }) {
  const [day, sid] = result?.session?.split("/") ?? [];
  return (
    <div className="ended">
      <h1>Call ended</h1>
      <p className="muted">
        {result?.session ? `session: ${result.session}` : ""}
      </p>
      <div className="feedback-card">
        <h2>📊 Feedback & report</h2>
        <p className="muted">
          being generated in the background — open the review in a few seconds
          and they'll fill in (spoken feedback, metrics report, question-by-question
          analysis).
        </p>
      </div>
      <div className="row">
        <button className="btn-ghost" onClick={onHome}>
          ← Back to dashboard
        </button>
        {day && sid && (
          <button className="btn-primary" onClick={() => onReview(day, sid)}>
            Review session →
          </button>
        )}
      </div>
    </div>
  );
}
