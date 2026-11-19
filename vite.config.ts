/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
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

// The script that sets the saved look before the first paint is tiny, so the built page carries it
// inline instead of waiting on another request. The Content-Security-Policy allows exactly this
// script by its hash (vercel.json); src/lib/site.test.ts fails if the two drift apart.
const themeScript = readFileSync(new URL("./public/theme.js", import.meta.url), "utf8");
function inlineThemeScript(): Plugin {
  const tag = '<script src="/theme.js"></script>';
  return {
    name: "listzero:inline-theme-script",
    apply: "build",
    transformIndexHtml(html) {
      if (!html.includes(tag)) throw new Error("index.html no longer loads /theme.js the way the build expects");
      return html.replace(tag, () => `<script>${themeScript}</script>`);
    },
  };
}

const apiProxy = { target: "http://localhost:8787", changeOrigin: false };

export default defineConfig({
  // The API runs beside the site in development and in the browser tests (`npm run api`), and both
  // servers forward /api to it, so the browser sees one site, as it does in production.
  // With the API not running, /api fails and the app simply has no accounts.
  server: { proxy: { "/api": apiProxy } },
  preview: { headers: securityHeaders, proxy: { "/api": apiProxy } },
  plugins: [
    react(),
    inlineThemeScript(),
    VitePWA({
      registerType: "autoUpdate",
      // Registered from src/main.tsx after the page has loaded, so it is not render-blocking.
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "og.png"],
      manifest: {
        id: "/",
        name: "Listzero",
        short_name: "Listzero",
        lang: "en",
        dir: "ltr",
        categories: ["productivity", "utilities"],
        description:
          "A free to-do list for busy minds. Capture fast, see one day at a time, get today to zero.",
        start_url: "/today",
        scope: "/",
        display: "standalone",
        orientation: "any",
        shortcuts: [
          { name: "Today", url: "/today" },
          { name: "Inbox", url: "/inbox" },
          { name: "Upcoming", url: "/upcoming" },
          { name: "Focus", short_name: "Focus", url: "/focus" },
        ],
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
        // A new version takes over as soon as it is installed, instead of waiting for every tab to close.
        // (The plugin only turns these on by itself when it also injects the registration script.)
        skipWaiting: true,
        clientsClaim: true,
        globIgnores: ["**/og.png", "**/*-latin-ext-*.woff2", "**/theme.js", "**/google*.html"],
        navigateFallback: "/index.html",
        // Real files (robots.txt, sitemap.xml, llms.txt, .well-known/…) are not app screens.
        // Nor is the API: signing in with Google comes back through /api/auth/callback as a page load.
        navigateFallbackDenylist: [/^\/[^/]+\.[a-z0-9]+$/i, /^\/\.well-known\//, /^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
  },
});
