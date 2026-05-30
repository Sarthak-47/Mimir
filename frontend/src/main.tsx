/**
 * main.tsx — Application entry point.
 *
 * This is the very first file the browser runs. It finds the empty <div id="root">
 * in index.html and mounts the entire React application inside it.
 * React.StrictMode is a development helper that highlights potential problems.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
