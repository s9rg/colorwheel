import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/react/styles.css";
import { App } from "./App";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (root === null) {
  throw new Error("The Colorwheel demo root is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
