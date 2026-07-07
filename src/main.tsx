// ── Suppress non-fatal Vite HMR WebSocket error in preview env ──
const origConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args.map((a: any) => String(a)).join(' ');
  if (msg.includes('failed to connect to websocket') || msg.includes('WebSocket connection error')) {
    return; // silent — Vite HMR doesn't work behind reverse proxy; app is fine
  }
  origConsoleError.apply(console, args);
};

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
