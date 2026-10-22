import { useCallback, useEffect, useRef, useState } from "react";
import {
  Captions as CaptionsIcon, Loader2, Mic, MessageSquareCode,
  PhoneOff, Send, Video, VideoOff, Volume2,
} from "lucide-react";
import { api } from "../api.js";
import { WavRecorder, playAudio, stopAudio } from "../audio.js";

const INTERVIEWER_NAME = "Riya";

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// micState machine: connecting -> ready -> recording -> processing -> speaking -> ready
export default function Call({ config, camStream, onEnded, onCancel }) {
  const isZoom = config.theme === "zoom";

  const [micState, setMicState] = useState("connecting");
  const [interviewId, setInterviewId] = useState(null);
  const [captions, setCaptions] = useState([]); // [{who, text, time}], last 3 shown
  const [captionsOn, setCaptionsOn] = useState(!isZoom); // zoom starts hidden (per design)
  const [camOn, setCamOn] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [boardOpen, setBoardOpen] = useState(isZoom); // zoom: sidebar open by default
  const [artifacts, setArtifacts] = useState([]);     // problem-board entries
  const [chatInput, setChatInput] = useState("");

  const videoRef = useRef(null);
  const recorder = useRef(new WavRecorder());
  const holding = useRef(false);
  const micStateRef = useRef(micState);
  micStateRef.current = micState;

  const pushCaption = useCallback((who, text) => {
    setCaptions((prev) => [...prev.slice(-2), { who, text, time: nowTime() }]);
  }, []);

  // ---- problem board (artifacts only; auto-open on arrival) ----
  const applyChat = useCallback((chat) => {
    if (!chat) return;
    setArtifacts(chat.filter((e) => e.kind === "artifact"));
    if (chat.some((e) => e.kind === "artifact")) setBoardOpen(true);
  }, []);

  // ---- join: start the interview (waiting-room beat covers the latency) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const started = await api.startInterview(config);
        if (cancelled) return;
        setInterviewId(started.interview_id);
        pushCaption(INTERVIEWER_NAME, started.opening);
        applyChat(started.chat);
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
      // leaving the call screen: kill audio + webcam (camera light off)
      stopAudio();
      if (camStream.current) {
        camStream.current.getTracks().forEach((t) => t.stop());
        camStream.current = null;
      }
    };
  }, [config, camStream, applyChat, pushCaption]);

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
      pushCaption("", "(too short — hold Space while you speak)");
      return;
    }
    setMicState("processing");
    try {
      const r = await api.sendAnswer(interviewId, blob);
      if (r.transcript) pushCaption("You", r.transcript);
      if (r.ended) {
        // answer endpoint already ended the interview; its response carries
        // the session ref — calling /end again could race the cleanup.
        onEnded(r);
        return;
      }
      if (r.chat) applyChat(r.chat);
      if (r.response) {
        pushCaption(INTERVIEWER_NAME, r.response);
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
  }, [interviewId, onEnded, applyChat, pushCaption]);

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

  // ---- typed answers (problem board) ----
  const sendChat = async (e) => {
    e?.preventDefault();
    const message = chatInput.trim();
    if (!message || micStateRef.current !== "ready") return;
    setChatInput("");
    pushCaption("You (typed)", message); // send confirmation
    setMicState("processing");
    try {
      const r = await api.sendChat(interviewId, message);
      if (r.chat) applyChat(r.chat);
      if (r.response) {
        pushCaption(INTERVIEWER_NAME, r.response);
        setMicState("speaking");
        if (r.audio) {
          await playAudio(api.interviewAudioUrl(interviewId, r.audio));
        }
      }
      setMicState("ready");
    } catch (err) {
      setError(err.message);
      setMicState("ready");
    }
  };

  const endCall = async () => {
    stopAudio(); // cut any in-flight interviewer playback immediately
    setMicState("processing");
    try {
      const end = await api.endInterview(interviewId);
      onEnded(end);
    } catch (e) {
      setError(e.message);
      setMicState("ready");
    }
  };

  const clock = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ].map((n) => String(n).padStart(2, "0")).join(":");

  const micLabel =
    micState === "recording" ? "release to send"
    : micState === "processing" ? "thinking…"
    : micState === "speaking" ? "listening…"
    : "hold to talk";

  const statusText =
    micState === "recording" ? "Recording your answer…"
    : micState === "processing" ? "Thinking…"
    : micState === "speaking" ? `${INTERVIEWER_NAME} is speaking`
    : "Connected · hold Space to talk";

  if (micState === "connecting") {
    return (
      <div className="waiting">
        <div className="spinner-ring" />
        <h2>Joining…</h2>
        <p className="muted">{INTERVIEWER_NAME} will let you in shortly</p>
        {error && <p className="error">{error}</p>}
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  const interviewTile = (
    <div className={`d-tile ${micState === "speaking" ? "d-tile-speaking" : ""}`}>
      <div className="d-avatar">
        {INTERVIEWER_NAME[0]}
        {micState === "speaking" && <span className="pulse-ring" />}
      </div>
      <div className="d-tile-label">
        <span className="d-avatar small">{INTERVIEWER_NAME[0]}</span>
        <span>{INTERVIEWER_NAME} · AI Interviewer</span>
      </div>
    </div>
  );

  const youTile = (
    <div className={`d-tile you ${micState === "recording" ? "d-tile-speaking" : ""}`}>
      {camOn && camStream.current ? (
        <video ref={videoRef} autoPlay playsInline muted className="cam" />
      ) : (
        <div className="d-cam-off"><div className="d-avatar you-avatar">Y</div></div>
      )}
      <div className="d-tile-label">
        <span>You</span>
        {micState === "recording" && <Mic size={12} />}
      </div>
    </div>
  );

  const captionsBlock = (
    <div className="d-captions">
      {captions.map((c, i) => (
        <div className="d-caption-line" key={i}>
          <span className={`d-who ${c.who.startsWith("You") ? "user" : ""}`}>{c.who || "·"}</span>
          <span className="d-caption-text">{c.text}</span>
          <span className="d-caption-time">{c.time}</span>
        </div>
      ))}
    </div>
  );

  const boardBlock = (
    <aside className={`d-board ${isZoom ? "d-board-side" : "d-board-overlay"}`}>
      <div className="d-board-head">
        <MessageSquareCode size={15} /> Problem Board
        <span className="spacer" />
        <button className="d-iconbtn" onClick={() => setBoardOpen(false)} aria-label="Close problem board">×</button>
      </div>
      <div className="d-board-content">
        {artifacts.length === 0 && (
          <p className="muted small">questions and code from {INTERVIEWER_NAME} appear here</p>
        )}
        {artifacts.map((a, i) => (
          <pre key={i}>{a.text}</pre>
        ))}
      </div>
      <form className="d-answer-box" onSubmit={sendChat}>
        <input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Type your answer…"
          aria-label="Type answer"
        />
        <button type="submit" disabled={!chatInput.trim() || micState !== "ready"} aria-label="Send answer">
          <Send size={15} />
        </button>
      </form>
    </aside>
  );

  return (
    <div className={`callscreen ${isZoom ? "zoom-mode" : "meet-mode"}`}>
      {/* meeting head */}
      <div className="d-meeting-head">
        <div className="d-brand"><span className="d-brandmark">∿</span><span>MockMan</span></div>
        <span className="d-vline" />
        <div className="d-meeting-title">{config.role} — {config.itype} round</div>
        <div className="d-head-right">
          <div className="d-timer"><span className="d-rec" /><span>{clock}</span></div>
        </div>
      </div>

      {isZoom ? (
        /* ---------------- ZOOM layout: stage + right sidebar board ---------------- */
        <>
          <div className="d-zoom-main">
            <div className="d-zoom-stage">
              <div className="d-tiles">{interviewTile}{youTile}</div>
            </div>
            {boardOpen && boardBlock}
          </div>
          {captionsOn && <div className="d-zoom-captions">{captionsBlock}</div>}
          <div className="d-zoom-controls">
            <button className={`d-zc ${micState === "recording" ? "active" : ""}`}
              onMouseDown={startTalk} onMouseUp={stopTalk}
              onMouseLeave={() => holding.current && stopTalk()}
              disabled={micState !== "ready" && micState !== "recording"}>
              <span className="glyph">{micState === "processing" ? <Loader2 size={20} className="spin" /> : micState === "speaking" ? <Volume2 size={20} /> : <Mic size={20} />}</span>
              <span>{micLabel}</span>
            </button>
            <button className={`d-zc ${!camOn ? "active" : ""}`} onClick={() => setCamOn((v) => !v)}>
              <span className="glyph">{camOn ? <Video size={20} /> : <VideoOff size={20} />}</span>
              <span>{camOn ? "Stop Video" : "Start Video"}</span>
            </button>
            <button className={`d-zc ${captionsOn ? "active" : ""}`} onClick={() => setCaptionsOn((v) => !v)}>
              <span className="glyph"><CaptionsIcon size={20} /></span><span>Captions</span>
            </button>
            <button className={`d-zc ${boardOpen ? "active" : ""}`} onClick={() => setBoardOpen((v) => !v)}>
              <span className="glyph"><MessageSquareCode size={20} /></span><span>Board</span>
            </button>
            <button className="d-zc end" onClick={endCall}>
              <PhoneOff size={16} /> End
            </button>
          </div>
        </>
      ) : (
        /* ---------------- MEET layout: tiles + captions + bottom cluster ---------------- */
        <>
          <div className="d-meet-body">
            <div className="d-tiles">{interviewTile}{youTile}</div>
            {captionsOn && captionsBlock}
          </div>
          {boardOpen && boardBlock}
          <div className="d-controls">
            <div className="d-control-group">
              <button className={`d-control ${captionsOn ? "active" : ""}`} onClick={() => setCaptionsOn((v) => !v)}>
                <CaptionsIcon size={17} /> Captions
              </button>
              <button className={`d-control ${boardOpen ? "active" : ""}`} onClick={() => setBoardOpen((v) => !v)}>
                <MessageSquareCode size={17} /> Problem board
              </button>
            </div>
            <div className="spacer" />
            <div className="d-control-group">
              <button
                className={`d-control round ${micState === "recording" ? "active" : ""}`}
                onMouseDown={startTalk} onMouseUp={stopTalk}
                onMouseLeave={() => holding.current && stopTalk()}
                onTouchStart={(e) => { e.preventDefault(); startTalk(); }}
                onTouchEnd={(e) => { e.preventDefault(); stopTalk(); }}
                disabled={micState !== "ready" && micState !== "recording"}
                title={micLabel} aria-label="Hold to talk">
                {micState === "processing" ? <Loader2 size={20} className="spin" />
                  : micState === "speaking" ? <Volume2 size={20} />
                  : <Mic size={20} />}
              </button>
              <button className={`d-control round ${!camOn ? "active" : ""}`}
                onClick={() => setCamOn((v) => !v)} title="Toggle camera" aria-label="Toggle camera">
                {camOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
              <button className="d-control round hangup" onClick={endCall} title="End interview" aria-label="End interview">
                <PhoneOff size={20} />
              </button>
            </div>
          </div>
        </>
      )}

      <div className="d-status">
        Status: <strong>{statusText}</strong>
        {micState === "ready" && <> · hold <kbd>Space</kbd> to talk</>}
        {error && <span className="error"> · {error}</span>}
      </div>
    </div>
  );
}
