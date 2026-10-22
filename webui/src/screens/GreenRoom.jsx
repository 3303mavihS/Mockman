import { useEffect, useRef, useState } from "react";
import { Video, VideoOff, Mic, MicOff, LogIn, ArrowLeft, Speaker } from "lucide-react";
import { toast } from "../toast.js";
import { setPreferredMic, setPreferredSpeaker } from "../audio.js";

// Pre-join green room — light "prep surface" per the approved design.
export default function GreenRoom({ config, camStream, onBack, onJoin }) {
  const videoRef = useRef(null);
  const meterStream = useRef(null);
  const meterCtx = useRef(null);
  const raf = useRef(null);

  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [micLevel, setMicLevel] = useState(0);
  const [camState, setCamState] = useState("checking");
  const [micState, setMicState] = useState("checking");
  const [mics, setMics] = useState([]);
  const [speakers, setSpeakers] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!camStream.current) {
          camStream.current = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = camStream.current;
          setCamState("ready");
        }
      } catch {
        if (!cancelled) setCamState("blocked");
      }
      try {
        meterStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new AudioContext();
        meterCtx.current = ctx;
        const src = ctx.createMediaStreamSource(meterStream.current);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setMicLevel((prev) => (micOnRef.current ? Math.min(1, peak / 60) : 0));
          raf.current = requestAnimationFrame(tick);
        };
        tick();
        if (!cancelled) setMicState("ready");

        // real device lists (labels available once permission is granted)
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setMics(devices.filter((d) => d.kind === "audioinput"));
          setSpeakers(devices.filter((d) => d.kind === "audiooutput"));
        }
      } catch {
        if (!cancelled) setMicState("blocked");
      }
    })();
    return () => {
      cancelled = true;
      if (raf.current) cancelAnimationFrame(raf.current);
      if (meterCtx.current) meterCtx.current.close();
      if (meterStream.current) meterStream.current.getTracks().forEach((t) => t.stop());
    };
  }, [camStream]);

  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;

  useEffect(() => {
    if (videoRef.current && camStream.current) {
      camStream.current.getVideoTracks().forEach((t) => (t.enabled = camOn));
    }
  }, [camOn, camStream]);

  useEffect(() => {
    if (meterStream.current) {
      meterStream.current.getAudioTracks().forEach((t) => (t.enabled = micOn));
    }
  }, [micOn]);

  const join = () => {
    if (!micOn) {
      toast("Turn on your microphone before joining.");
      return;
    }
    onJoin();
  };

  const statusChip = (state, onLabel = "Ready") =>
    state === "ready"
      ? <span className="gr-status">{onLabel}</span>
      : <span className="gr-status pending">{state === "blocked" ? "Blocked" : "Checking…"}</span>;

  return (
    <div className="gr-page screen">
      <header className="gr-topbar">
        <div className="brand" style={{ color: "var(--ink)" }}>
          <span className="brandmark">∿</span><span>MockMan</span>
        </div>
        <div className="gr-top-right"><span className="gr-dot" /> Device check <span style={{ opacity: 0.45 }}>/</span> Before you join</div>
      </header>

      <main className="gr-main">
        <div className="eyebrow">Interview setup · Step 2 of 2</div>
        <div className="gr-heading">
          <div>
            <h1>Get comfortable.<br />You're almost there.</h1>
            <p>Make sure your camera and microphone are ready. Take a breath — this is practice, not a performance.</p>
          </div>
          <div className="gr-step">02 <span style={{ color: "#8b8d83" }}>/</span> Green room</div>
        </div>

        <div className="gr-layout">
          {/* ---------- camera preview ---------- */}
          <section className="gr-panel">
            <div className="gr-panel-head">
              <h2>Your camera preview</h2>
              <span>{camOn ? (camState === "ready" ? "Camera is on" : "Camera unavailable") : "Camera is off"}</span>
            </div>
            <div className={`gr-preview ${!camOn || camState === "blocked" ? "camera-disabled" : ""}`}>
              <div className="gr-preview-label">You · Preview</div>
              {camOn && camState !== "blocked" ? (
                <video ref={videoRef} autoPlay playsInline muted className="gr-cam" />
              ) : (
                <div className="gr-camera-off">
                  <div className="gr-off-icon"><VideoOff size={26} /></div>
                  <strong>Camera is off</strong>
                  <p>Turn it back on when you're ready.</p>
                </div>
              )}
              <div className="gr-preview-tools">
                <button
                  className={`gr-round-btn ${camOn ? "" : "off"}`}
                  onClick={() => setCamOn((v) => !v)}
                  aria-label="Toggle camera"
                >
                  {camOn ? <Video size={16} /> : <VideoOff size={16} />}
                  <span>Camera {camOn ? "on" : "off"}</span>
                </button>
                <button
                  className={`gr-round-btn ${micOn ? "" : "off"}`}
                  onClick={() => setMicOn((v) => !v)}
                  aria-label="Toggle microphone"
                >
                  {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                  <span>Mic {micOn ? "on" : "off"}</span>
                </button>
              </div>
            </div>
            <div className="gr-device-note">
              <span className="gr-dot" />
              <span><strong>You're in control.</strong> Your camera and mic are only used during the interview.</span>
            </div>
          </section>

          <div className="gr-side">
            {/* ---------- device check ---------- */}
            <section className="gr-panel">
              <div className="gr-panel-head"><h2>Device check</h2><span>Ready when you are</span></div>
              <div className="gr-checks">
                <div className="gr-check">
                  <div className="gr-check-icon"><Video size={17} /></div>
                  <div className="gr-check-copy">
                    <strong>Camera</strong>
                    <small>{camState === "ready" ? (camOn ? "Preview is active" : "Camera disabled") : camState === "blocked" ? "Permission blocked" : "Requesting…"}</small>
                  </div>
                  {camOn ? statusChip(camState) : <span className="gr-status pending">Off</span>}
                </div>
                <div className="gr-check">
                  <div className="gr-check-icon"><Mic size={17} /></div>
                  <div className="gr-check-copy">
                    <strong>Microphone</strong>
                    <small>{micOn ? (micState === "ready" ? "Input active — speak to see the level" : "Requesting…") : "Microphone muted"}</small>
                    <span className="gr-mini-meter"><span style={{ width: `${micLevel * 100}%` }} /></span>
                  </div>
                  {micOn ? statusChip(micState) : <span className="gr-status pending">Muted</span>}
                </div>
                <div className="gr-check">
                  <div className="gr-check-icon"><Speaker size={17} /></div>
                  <div className="gr-check-copy">
                    <strong>Speaker</strong>
                    <small>Interviewer's voice plays here</small>
                  </div>
                  <span className="gr-status">Available</span>
                </div>
              </div>
              {mics.length > 0 && (
                <div className="gr-select-row">
                  <label>MICROPHONE</label>
                  <select defaultValue="" onChange={(e) => setPreferredMic(e.target.value || null)}>
                    <option value="">Default microphone</option>
                    {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}
                  </select>
                </div>
              )}
              {speakers.length > 0 && (
                <div className="gr-select-row">
                  <label>SPEAKER</label>
                  <select defaultValue="" onChange={(e) => setPreferredSpeaker(e.target.value || null)}>
                    <option value="">Default speaker</option>
                    {speakers.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Speaker"}</option>)}
                  </select>
                </div>
              )}
            </section>

            {/* ---------- session summary ---------- */}
            <section className="gr-panel">
              <div className="gr-summary">
                <div className="eyebrow">Your upcoming session</div>
                <div className="gr-summary-title">{config.role}</div>
                <div className="gr-summary-sub">A focused, realistic practice interview</div>
                <div className="gr-meta"><span>Interview round</span><strong style={{ textTransform: "capitalize" }}>{config.itype}</strong></div>
                <div className="gr-meta"><span>Interviewer</span><strong>Riya · AI Interviewer</strong></div>
                <div className="gr-meta"><span>Estimated time</span><strong>15–30 minutes</strong></div>
                <div className="gr-actions">
                  <button className="gr-primary" onClick={join}>
                    Join interview <LogIn size={15} />
                  </button>
                  <button className="gr-secondary" onClick={onBack}>Back</button>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="gr-footnote">
          You can leave at any time. Your session will only be reviewed if you submit answers.
        </div>
      </main>
    </div>
  );
}
