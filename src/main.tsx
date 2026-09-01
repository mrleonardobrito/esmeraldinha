import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import { App } from "@/App";
import { migrateProfessoresFromLocalStorage } from "@/lib/professores-migration";

void migrateProfessoresFromLocalStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
