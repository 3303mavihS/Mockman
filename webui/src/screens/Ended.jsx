export default function Ended({ result, onHome }) {
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
      <button className="btn-primary" onClick={onHome}>
        ← Back to dashboard
      </button>
    </div>
  );
}
