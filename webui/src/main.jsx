import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// No StrictMode: Call.jsx performs a real side effect (starts an interview
// session) on mount, and StrictMode's double-mount would fire it twice.
createRoot(document.getElementById("root")).render(<App />);
