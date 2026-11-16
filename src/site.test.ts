// @vitest-environment node
/**
 * Checks on the files that make the site a site: the page head, the hosting rules,
 * and the files crawlers and security researchers look for. These fail when two
 * places that must agree (a script and the policy that allows it, a route and the
 * rewrite that serves it) drift apart.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
/** A string constant read out of a source file, so this test needs none of the app's browser types. */
const constant = (path: string, name: string) =>
  new RegExp(`export const ${name} = "([^"]+)"`).exec(read(path))?.[1] ?? `missing ${name}`;
const GA_ID = constant("src/lib/analytics.ts", "GA_ID");
const SITE_HOST = constant("src/lib/analytics.ts", "SITE_HOST");
const SITE_TITLE = constant("src/state/usePageTitle.ts", "SITE_TITLE");
const html = read("index.html");
const vercel = JSON.parse(read("vercel.json")) as {
  trailingSlash: boolean;
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const everywhere = Object.fromEntries(
  (vercel.headers.find((h) => h.source === "/(.*)")?.headers ?? []).map((h) => [h.key, h.value]),
);
const csp = Object.fromEntries(
  (everywhere["Content-Security-Policy"] ?? "").split(";").map((part) => {
    const [name = "", ...values] = part.trim().split(/\s+/);
    return [name, values];
  }),
);

describe("content security policy", () => {
  it("allows the inline theme script by its exact hash, and no other inline script", () => {
    const hash = createHash("sha256").update(read("public/theme.js")).digest("base64");
    expect(csp["script-src"]).toContain(`'sha256-${hash}'`);
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect((csp["script-src"] ?? []).filter((v) => v.startsWith("'sha256-"))).toHaveLength(1);
  });

  it("names the analytics hosts and nothing wider", () => {
    expect(csp["script-src"]).toContain("https://www.googletagmanager.com");
    expect(csp["connect-src"]).toEqual([
      "'self'",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://*.googletagmanager.com",
    ]);
    for (const values of Object.values(csp)) {
      expect(values).not.toContain("*");
      expect(values).not.toContain("https:");
    }
    expect(csp["style-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
  });

  it("is sent with the other security headers", () => {
    expect(everywhere["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}; includeSubDomains$/);
    expect(everywhere["X-Content-Type-Options"]).toBe("nosniff");
    expect(everywhere["X-Frame-Options"]).toBe("DENY");
    expect(everywhere["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(everywhere["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(everywhere["Permissions-Policy"]).toContain("camera=()");
  });
});

describe("hosting rules", () => {
  it("serves the app for every route the app has, and nothing else", () => {
    const app = read("src/App.tsx");
    const routes = [...app.matchAll(/<Route path="([^"*]+)"/g)].map((m) => m[1] ?? "");
    expect(routes.length).toBeGreaterThan(8);
    const served = (path: string) =>
      vercel.rewrites.some((r) => new RegExp(`^${r.source.replace(/:\w+/g, "[^/]+")}$`).test(path));
    for (const route of routes) {
      const path = `/${route.replace(/:\w+/, "abc123")}`;
      expect(served(path), `${path} needs a rewrite in vercel.json`).toBe(true);
    }
    // Anything else gets the host's real 404, not the app with a 200.
    for (const path of ["/nope", "/wp-login.php", "/.well-known/ard.json", "/list", "/list/a/b", "/today/x"]) {
      expect(served(path), path).toBe(false);
    }
    expect(vercel.trailingSlash).toBe(false);
  });
});

describe("page head", () => {
  it("has the title the app restores, a description and a canonical address", () => {
    expect(html).toContain(`<title>${SITE_TITLE}</title>`);
    const description = /name="description"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(110);
    expect(description.length).toBeLessThan(230);
    expect(html).toContain(`<link rel="canonical" href="https://${SITE_HOST}/" />`);
  });

  it("has share-card tags that point at a real image", () => {
    for (const tag of ["og:title", "og:description", "og:url", "og:image", "og:image:alt", "og:site_name"]) {
      expect(html).toContain(`property="${tag}"`);
    }
    for (const tag of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
      expect(html).toContain(`name="${tag}"`);
    }
    expect(existsSync(new URL("../public/og.png", import.meta.url))).toBe(true);
  });

  it("describes the app in valid structured data", () => {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const data = JSON.parse(block) as Record<string, unknown>;
    expect(data["@type"]).toBe("WebApplication");
    expect(data.url).toBe(`https://${SITE_HOST}/`);
    expect(data.offers).toMatchObject({ price: "0" });
    expect(block).not.toContain("</");
  });

  it("loads the theme script the way the build expects", () => {
    expect(html).toContain('<script src="/theme.js"></script>');
  });
});

describe("files for crawlers and researchers", () => {
  it("has a sitemap, robots.txt and llms.txt that agree on the address", () => {
    expect(read("public/robots.txt")).toContain(`Sitemap: https://${SITE_HOST}/sitemap.xml`);
    expect(read("public/sitemap.xml")).toContain(`<loc>https://${SITE_HOST}/about</loc>`);
    const llms = read("public/llms.txt");
    expect(llms.startsWith("# Listzero\n")).toBe(true);
    expect(llms).toContain(`https://${SITE_HOST}/about`);
  });

  it("has a security contact that has not expired", () => {
    const text = read("public/.well-known/security.txt");
    expect(text).toMatch(/^Contact: https:\/\//m);
    const expires = /^Expires: (.+)$/m.exec(text)?.[1] ?? "";
    expect(new Date(expires).getTime()).toBeGreaterThan(Date.now());
    expect(existsSync(new URL("../SECURITY.md", import.meta.url))).toBe(true);
  });

  it("uses one analytics id, and says so in the privacy text", () => {
    expect(GA_ID).toMatch(/^G-[A-Z0-9]{10}$/);
    expect(read("src/views/About.tsx")).toContain("Google Analytics");
    expect(read("README.md")).toContain("Google Analytics");
  });
});
