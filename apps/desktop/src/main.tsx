import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { initializeAppLogging } from "./app/appLogging";
import "./styles/globals.css";

initializeAppLogging();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
