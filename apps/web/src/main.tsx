import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "github-markdown-css/github-markdown-light.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

