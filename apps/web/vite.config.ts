import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { redact } from "@tanstack/redact/vite";

export default defineConfig(({ command }) => ({
  base:
    command === "serve"
      ? "/"
      : process.env.VITE_BASE_PATH || "/pdf-hidden-text-remover/",
  plugins: [react(), tailwindcss(), redact()],
  build: {
    target: "es2022",
  },
}));
