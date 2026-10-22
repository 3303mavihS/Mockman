import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Video, VideoOff, LogIn } from "lucide-react";

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
    <div className="greenroom screen">
      <div className="setup-head">
        <h1>Ready to join?</h1>
        <p className="muted small">
          {config.role} · {config.itype} · {config.theme === "meet" ? "Meet-style" : "Zoom-style"}
        </p>
      </div>

      <div className="preview-tile">
        <div className="preview-name">You</div>
        {camOn && !error?.includes("camera") ? (
          <video ref={videoRef} autoPlay playsInline muted />
        ) : (
          <div className="avatar avatar-lg avatar-you">You</div>
        )}
        <div className="mic-meter" title="mic level">
          <div className="mic-meter-fill" style={{ width: `${micLevel * 100}%` }} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="row spread" style={{ width: "100%" }}>
        <div className="row">
          <button className="btn-ghost" onClick={() => setCamOn((v) => !v)}>
            {camOn ? <Video size={16} /> : <VideoOff size={16} />}
            {camOn ? "camera on" : "camera off"}
          </button>
          <button className="btn-ghost" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
        </div>
        <button className="btn-primary" onClick={onJoin}>
          <LogIn size={16} /> Join now
        </button>
      </div>
      <p className="muted small">speak to check the mic meter before joining</p>
    </div>
  );
}
