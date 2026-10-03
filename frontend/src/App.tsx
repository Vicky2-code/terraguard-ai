import { useEffect, useState } from "react";
import { checkBackend } from "./services/api";
import "./App.css";

function App() {
  const [status, setStatus] = useState("Checking backend...");
  const [error, setError] = useState("");

  useEffect(() => {
    checkBackend()
      .then((data) => {
        setStatus(`${data.status} — ${data.service}`);
        setError("");
      })
      .catch(() => {
        setStatus("Backend connection failed");
        setError("Make sure the FastAPI server is running on port 8000.");
      });
  }, []);

  return (
    <main className="app">
      <section className="status-card">
        <p className="eyebrow">AI-POWERED DISASTER MONITORING</p>
        <h1>TERRAGUARD AI</h1>
        <p className="subtitle">
          Multi-Source Landslide Risk Monitoring & Early Warning System
        </p>

        <div className="connection">
          <span
            className={`status-dot ${
              status.startsWith("healthy") ? "online" : "offline"
            }`}
          />
          <span>{status}</span>
        </div>

        {error && <p className="error">{error}</p>}

        <p className="tagline">MONITOR · PREDICT · PROTECT</p>
      </section>
    </main>
  );
}

export default App;