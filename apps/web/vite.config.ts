import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { redact } from "@tanstack/redact/vite";

function injectFirebaseScript(script: string | undefined): Plugin {
  return {
    name: "inject-firebase-script",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const firebaseScript = script?.trim();
        if (!firebaseScript) return html;
        return html.replace("</head>", `${firebaseScript}\n  </head>`);
      },
    },
  };
}

export default defineConfig(({ command }) => ({
  base:
    command === "serve"
      ? "/"
      : process.env.VITE_BASE_PATH || "/pdf-hidden-text-remover/",
  plugins: [
    react(),
    tailwindcss(),
    redact(),
    injectFirebaseScript(process.env.FIREBASE_SCRIPT),
  ],
  build: {
    target: "es2022",
  },
}));
