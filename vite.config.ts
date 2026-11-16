/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { VitePWA } from "vite-plugin-pwa";

// `npm run preview` serves with the same security headers as production (vercel.json),
// so the browser tests run under the real Content-Security-Policy.
const vercel = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const securityHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === "/(.*)")?.headers ?? [])
    .filter((h) => h.key !== "Strict-Transport-Security")
    .map((h) => [h.key, h.value]),
);

export default defineConfig({
  preview: { headers: securityHeaders },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "og.png"],
      manifest: {
        name: "Listzero",
        short_name: "Listzero",
        description:
          "A free to-do list for busy minds. Capture fast, see one day at a time, get today to zero.",
        start_url: "/today",
        scope: "/",
        display: "standalone",
        background_color: "#f1f2ec",
        theme_color: "#f1f2ec",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["**/og.png", "**/*-latin-ext-*.woff2"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
});
