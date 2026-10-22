import { useRef, useState } from "react";
import Home from "./screens/Home.jsx";
import Setup from "./screens/Setup.jsx";
import GreenRoom from "./screens/GreenRoom.jsx";
import Call from "./screens/Call.jsx";
import Ended from "./screens/Ended.jsx";
import SessionDetail from "./screens/SessionDetail.jsx";
import Settings from "./screens/Settings.jsx";

// Screen state machine:
// home <-> setup -> greenroom -> call -> ended -> home
// home -> sessionDetail / settings
export default function App() {
  const [screen, setScreen] = useState("home");
  const [config, setConfig] = useState(null);       // {role, itype, context, theme, persona}
  const [endResult, setEndResult] = useState(null); // {feedback, session}
  const [detail, setDetail] = useState(null);       // {day, sid}
  const camStream = useRef(null);                   // shared webcam stream

  const goHome = () => setScreen("home");

  return (
    <div className="app">
      {screen === "home" && (
        <Home
          onNewInterview={() => setScreen("setup")}
          onOpenSession={(day, sid) => {
            setDetail({ day, sid });
            setScreen("session");
          }}
          onSettings={() => setScreen("settings")}
        />
      )}
      {screen === "setup" && (
        <Setup
          onBack={goHome}
          onContinue={(cfg) => {
            setConfig(cfg);
            setScreen("greenroom");
          }}
        />
      )}
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
          onEnded={(result) => {
            setEndResult(result);
            setScreen("ended");
          }}
        />
      )}
      {screen === "ended" && (
        <Ended
          result={endResult}
          onHome={goHome}
          onReview={(day, sid) => {
            setDetail({ day, sid });
            setScreen("session");
          }}
        />
      )}
      {screen === "session" && detail && (
        <SessionDetail day={detail.day} sid={detail.sid} onBack={goHome} />
      )}
      {screen === "settings" && <Settings onBack={goHome} />}
    </div>
  );
}
