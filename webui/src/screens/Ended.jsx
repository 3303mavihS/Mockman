export default function Ended({ result, onHome, onReview }) {
  const [day, sid] = result?.session?.split("/") ?? [];
  return (
    <div className="ended">
      <h1>Call ended</h1>
      <p className="muted">
        {result?.session ? `session saved: ${result.session}` : ""}
      </p>
      {result?.feedback && (
        <div className="feedback-card">
          <h2>📊 Feedback</h2>
          <p className="feedback-text">{result.feedback}</p>
        </div>
      )}
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
