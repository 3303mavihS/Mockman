import { useEffect, useRef, useState } from "react";

// Pre-join room: webcam preview + mic level check, Meet-style.
export default function GreenRoom({ config, camStream, onBack, onJoin }) {
  const videoRef = useRef(null);
  const [camOn, setCamOn] = useState(true);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState(null);
  const meterStream = useRef(null);
  const raf = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // webcam preview (kept alive for the call screen)
        if (!camStream.current) {
          camStream.current = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
        }
        if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = camStream.current;
        }
      } catch {
        if (!cancelled) setError("camera blocked — you can still join, avatar will show");
      }
      try {
        // mic level meter (thrown away on unmount)
        meterStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(meterStream.current);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setMicLevel(Math.min(1, peak / 60));
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) setError("microphone blocked — the interview needs your mic");
      }
    })();
    return () => {
      cancelled = true;
      if (raf.current) cancelAnimationFrame(raf.current);
      if (meterStream.current)
        meterStream.current.getTracks().forEach((t) => t.stop());
    };
  }, [camStream]);

  useEffect(() => {
    if (videoRef.current && camStream.current) {
      camStream.current.getVideoTracks().forEach((t) => (t.enabled = camOn));
    }
  }, [camOn, camStream]);

  return (
    <div className="greenroom">
      <h1>Ready to join?</h1>
      <p className="muted">
        {config.role} · {config.itype} · {config.theme === "meet" ? "Meet-style" : "Zoom-style"}
      </p>

      <div className="preview-tile">
        {camOn && !error?.includes("camera") ? (
          <video ref={videoRef} autoPlay playsInline muted />
        ) : (
          <div className="avatar avatar-lg">You</div>
        )}
        <div className="mic-meter" title="mic level">
          <div className="mic-meter-fill" style={{ width: `${micLevel * 100}%` }} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="row">
        <button className="btn-ghost" onClick={() => setCamOn((v) => !v)}>
          {camOn ? "📷 camera on" : "🚫 camera off"}
        </button>
        <button className="btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <button className="btn-primary" onClick={onJoin}>
          Join now
        </button>
      </div>
      <p className="muted small">speak to check the mic meter before joining</p>
    </div>
  );
}
