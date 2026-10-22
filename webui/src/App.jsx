import { useEffect, useRef, useState } from "react";
import { Home as HomeIcon, Plus, LayoutList, Settings as SettingsIcon } from "lucide-react";
import Home from "./screens/Home.jsx";
import Setup from "./screens/Setup.jsx";
import GreenRoom from "./screens/GreenRoom.jsx";
import Call from "./screens/Call.jsx";
import Ended from "./screens/Ended.jsx";
import SessionDetail from "./screens/SessionDetail.jsx";
import Settings from "./screens/Settings.jsx";

const CRUMBS = {
  home: "Workspace / Home",
  setup: "Workspace / New interview",
  session: "Workspace / Session review",
  settings: "Workspace / Settings",
  ended: "Workspace / Call ended",
};

function ToastHost() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let timer;
    const on = (e) => {
      setMsg(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener("mockman:toast", on);
    return () => window.removeEventListener("mockman:toast", on);
  }, []);
  return <div className={`toast ${msg ? "show" : ""}`} role="status">{msg}</div>;
}

const ACCENTS = { "Electric chartreuse": "#d4f36a", "Signal coral": "#f2845c" };

export default function App() {
  // platform screens live inside the sidebar shell; greenroom/call are fullscreen
  const [screen, setScreen] = useState("home");

  // persisted appearance preferences (Settings → Appearance)
  useEffect(() => {
    try {
      const a = JSON.parse(localStorage.getItem("mockman.appearance")) || {};
      if (a.accent && ACCENTS[a.accent]) {
        document.documentElement.style.setProperty("--lime", ACCENTS[a.accent]);
      }
      document.body.dataset.theme = a.theme === "Dark" ? "dark" : "";
    } catch { /* defaults */ }
  }, []);
  const [config, setConfig] = useState(null);
  const [endResult, setEndResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const camStream = useRef(null);

  // single source of truth for camera privacy: the webcam may only live on
  // the green-room and call screens — any other screen kills it, no matter
  // which path got us here (back, cancel, end, future screens).
  useEffect(() => {
    if (screen !== "greenroom" && screen !== "call" && camStream.current) {
      camStream.current.getTracks().forEach((t) => t.stop());
      camStream.current = null;
    }
  }, [screen]);

  const goHome = () => setScreen("home");
  const openSession = (day, sid) => {
    setDetail({ day, sid });
    setScreen("session");
  };

  if (screen === "greenroom" || screen === "call") {
    return (
      <>
        {screen === "greenroom" && (
          <GreenRoom
            config={config}
            camStream={camStream}
            onBack={() => setScreen("setup")}
            onJoin={() => setScreen("call")}
          />
        )}
        {screen === "call" && (
          <Call
            config={config}
            camStream={camStream}
            onCancel={goHome}
            onEnded={(result) => {
              setEndResult(result);
              setScreen("ended");
            }}
          />
        )}
        <ToastHost />
      </>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brandmark">∿</span><span>MockMan</span></div>
        <nav className="nav">
          <button className={screen === "home" ? "active" : ""} onClick={goHome}>
            <span className="nav-icon"><HomeIcon size={16} /></span>Home
          </button>
          <button className={screen === "setup" ? "active" : ""} onClick={() => setScreen("setup")}>
            <span className="nav-icon"><Plus size={16} /></span>New interview
          </button>
          <button className={screen === "session" ? "active" : ""} onClick={goHome}>
            <span className="nav-icon"><LayoutList size={16} /></span>Sessions
          </button>
          <button className={screen === "settings" ? "active" : ""} onClick={() => setScreen("settings")}>
            <span className="nav-icon"><SettingsIcon size={16} /></span>Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="signal">∿</div>
          <strong>Keep going.</strong>
          <p>Every conversation makes you sharper.</p>
        </div>
      </aside>

      <main>
        <div className="topline">
          <div className="crumb">{CRUMBS[screen] || "Workspace"}</div>
          <div className="top-actions">
            <button className="btn" onClick={() => setScreen("settings")}>
              <SettingsIcon size={15} /> Settings
            </button>
            <button className="btn primary" onClick={() => setScreen("setup")}>
              <Plus size={15} /> New interview
            </button>
            <button
              className="avatar-mini"
              style={{ border: 0, cursor: "pointer" }}
              title="Workspace settings"
              onClick={() => setScreen("settings")}
            >
              S
            </button>
          </div>
        </div>

        {screen === "home" && <Home onOpenSession={openSession} />}
        {screen === "setup" && (
          <Setup
            onBack={goHome}
            onContinue={(cfg) => {
              setConfig(cfg);
              setScreen("greenroom");
            }}
          />
        )}
        {screen === "session" && detail && (
          <SessionDetail day={detail.day} sid={detail.sid} onBack={goHome} />
        )}
        {screen === "settings" && <Settings />}
        {screen === "ended" && (
          <Ended
            result={endResult}
            onHome={goHome}
            onReview={openSession}
            onNewInterview={() => setScreen("setup")}
          />
        )}
      </main>
      <ToastHost />
    </div>
  );
}
