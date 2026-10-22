import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { WavRecorder, playAudio } from "../audio.js";

const INTERVIEWER_NAME = "Riya";

// micState machine: connecting -> ready -> recording -> processing -> speaking -> ready
export default function Call({ config, camStream, onEnded }) {
  const [micState, setMicState] = useState("connecting");
  const [interviewId, setInterviewId] = useState(null);
  const [caption, setCaption] = useState({ who: "", text: "" });
  const [captionsOn, setCaptionsOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const recorder = useRef(new WavRecorder());
  const holding = useRef(false);
  const micStateRef = useRef(micState);
  micStateRef.current = micState;

  // ---- join: start the interview (waiting-room beat covers the latency) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const started = await api.startInterview(config);
        if (cancelled) return;
        setInterviewId(started.interview_id);
        setCaption({ who: INTERVIEWER_NAME, text: started.opening });
        setMicState("speaking");
        if (started.audio) {
          await playAudio(api.interviewAudioUrl(started.interview_id, started.audio));
        }
        if (!cancelled) setMicState("ready");
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  // ---- candidate video tile ----
  useEffect(() => {
    if (videoRef.current && camStream.current) {
      videoRef.current.srcObject = camStream.current;
      camStream.current.getVideoTracks().forEach((t) => (t.enabled = camOn));
    }
  }, [camOn, camStream, micState]);

  // ---- meeting timer ----
  useEffect(() => {
    if (micState === "connecting") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [micState === "connecting"]);

  // ---- answer flow ----
  const startTalk = useCallback(() => {
    if (micStateRef.current !== "ready" || holding.current) return;
    holding.current = true;
    setMicState("recording");
    recorder.current.start().catch(() => {
      holding.current = false;
      setMicState("ready");
      setError("microphone unavailable");
    });
  }, []);

  const stopTalk = useCallback(async () => {
    if (!holding.current) return;
    holding.current = false;
    const blob = recorder.current.stop();
    if (!blob) {
      setMicState("ready");
      setCaption({ who: "", text: "(too short — hold Space while you speak)" });
      return;
    }
    setMicState("processing");
    try {
      const r = await api.sendAnswer(interviewId, blob);
      if (r.transcript) setCaption({ who: "You", text: r.transcript });
      if (r.ended) {
        const end = await api.endInterview(interviewId);
        onEnded(end);
        return;
      }
      const text = r.response;
      if (text) {
        setCaption({ who: INTERVIEWER_NAME, text });
        setMicState("speaking");
        if (r.audio) {
          await playAudio(api.interviewAudioUrl(interviewId, r.audio));
        }
      }
      setMicState("ready");
    } catch (e) {
      setError(e.message);
      setMicState("ready");
    }
  }, [interviewId, onEnded]);

  // ---- hold-to-talk: Space ----
  useEffect(() => {
    const down = (e) => {
      if (e.code !== "Space" || e.repeat) return;
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      e.preventDefault();
      startTalk();
    };
    const up = (e) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      stopTalk();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startTalk, stopTalk]);

  const endCall = async () => {
    setMicState("processing");
    try {
      const end = await api.endInterview(interviewId);
      onEnded(end);
    } catch (e) {
      setError(e.message);
      setMicState("ready");
    }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (micState === "connecting") {
    return (
      <div className="waiting">
        <div className="spinner-ring" />
        <h2>Joining…</h2>
        <p className="muted">{INTERVIEWER_NAME} will let you in shortly</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="call">
      <div className="call-topbar">
        <span className="rec-dot" /> Rec
        <span className="call-title">{config.role} — {config.itype}</span>
        <span className="timer">{mm}:{ss}</span>
      </div>

      <div className="grid">
        <div className={`tile ${micState === "speaking" ? "tile-speaking" : ""}`}>
          <div className="avatar avatar-lg">
            {INTERVIEWER_NAME[0]}
            {micState === "speaking" && <span className="pulse-ring" />}
          </div>
          <div className="tile-name">{INTERVIEWER_NAME} (Interviewer)</div>
        </div>
        <div className={`tile ${micState === "recording" ? "tile-speaking" : ""}`}>
          {camOn && camStream.current ? (
            <video ref={videoRef} autoPlay playsInline muted className="cam" />
          ) : (
            <div className="avatar avatar-lg">You</div>
          )}
          <div className="tile-name">
            You {micState === "recording" ? "· 🎙️" : ""}
          </div>
        </div>
      </div>

      {captionsOn && caption.text && (
        <div className="captions">
          {caption.who && <b>{caption.who}: </b>}
          {caption.text}
        </div>
      )}
      {error && <p className="error center">{error}</p>}

      <div className="control-bar">
        <button
          className={`ctl ${captionsOn ? "ctl-on" : ""}`}
          onClick={() => setCaptionsOn((v) => !v)}
          title="captions"
        >
          💬
        </button>
        <button
          className={`ctl ${camOn ? "ctl-on" : ""}`}
          onClick={() => setCamOn((v) => !v)}
          title="camera"
        >
          {camOn ? "📷" : "🚫"}
        </button>
        <button
          className={`ctl ctl-mic ${micState === "recording" ? "ctl-recording" : ""}`}
          onMouseDown={startTalk}
          onMouseUp={stopTalk}
          onMouseLeave={() => holding.current && stopTalk()}
          onTouchStart={(e) => { e.preventDefault(); startTalk(); }}
          onTouchEnd={(e) => { e.preventDefault(); stopTalk(); }}
          disabled={micState !== "ready" && micState !== "recording"}
          title="hold to talk"
        >
          {micState === "recording" ? "🎙️ release to send"
            : micState === "processing" ? "⏳ thinking…"
            : micState === "speaking" ? "🔊 listening…"
            : "🎤 hold to talk"}
        </button>
        <button className="ctl ctl-end" onClick={endCall} title="end call">
          📞 End
        </button>
      </div>
      <p className="muted small center">hold Space to talk · mic is muted while {INTERVIEWER_NAME} speaks</p>
    </div>
  );
}
