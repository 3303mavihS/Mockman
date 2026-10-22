import { useRef, useState } from "react";
import Home from "./screens/Home.jsx";
import Setup from "./screens/Setup.jsx";
import GreenRoom from "./screens/GreenRoom.jsx";
import Call from "./screens/Call.jsx";
import Ended from "./screens/Ended.jsx";

// Screen state machine: home -> setup -> greenroom -> call -> ended -> home
export default function App() {
  const [screen, setScreen] = useState("home");
  const [config, setConfig] = useState(null);       // {role, itype, context, theme, persona}
  const [endResult, setEndResult] = useState(null); // {feedback, session}
  const camStream = useRef(null);                   // shared webcam stream

  return (
    <div className="app">
      {screen === "home" && (
        <Home onNewInterview={() => setScreen("setup")} />
      )}
      {screen === "setup" && (
        <Setup
          onBack={() => setScreen("home")}
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
        <Ended result={endResult} onHome={() => setScreen("home")} />
      )}
    </div>
  );
}
