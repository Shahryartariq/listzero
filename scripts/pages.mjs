// Runs after `vite build`. A single-page app has one HTML file, so every address would share the
// home page's title, description and canonical link, and unknown addresses would answer "200 OK".
// This writes the few extra files that fix that:
//   dist/about/index.html  the same app, with "How it works" in the head
//   dist/404.html          the same app, served by the host with a real 404 status
//   dist/sitemap.xml       with today's date
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const home = readFileSync(new URL("index.html", dist), "utf8");
const SITE = "https://listzero.vercel.app";

/** Replaces exactly one match, and fails the build if the page no longer has it. */
function swap(html, pattern, replacement, what) {
  const matches = html.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
  if (!matches || matches.length !== 1) throw new Error(`pages.mjs: expected one ${what}, found ${matches?.length ?? 0}`);
  return html.replace(pattern, replacement);
}

function withHead(html, { title, description, url }) {
  let out = html;
  out = swap(out, /<title>[^<]*<\/title>/, `<title>${title}</title>`, "<title>");
  out = swap(out, /(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${description}$2`, "description");
  out = swap(out, /(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`, "og:title");
  out = swap(out, /(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${description}$2`, "og:description");
  out = swap(out, /(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`, "twitter:title");
  out = swap(out, /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${description}$2`, "twitter:description");
  out = swap(out, /(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`, "og:url");
  return out;
}

// --- /about
const about = swap(
  withHead(home, {
    title: "How Listzero works: a to-do list for minds that get overwhelmed",
    description:
      "How Listzero works: the words quick add understands, the Today count, steps, Focus, layouts, keyboard shortcuts, where your tasks are kept, and what the site counts.",
    url: `${SITE}/about`,
  }),
  /(<link rel="canonical" href=")[^"]*(")/,
  `$1${SITE}/about$2`,
  "canonical",
);
mkdirSync(new URL("about/", dist), { recursive: true });
writeFileSync(new URL("about/index.html", dist), about);

// --- 404
let missing = swap(home, /<title>[^<]*<\/title>/, "<title>Page not found | Listzero</title>", "<title>");
missing = swap(missing, /\s*<link rel="canonical" href="[^"]*" \/>/, '\n    <meta name="robots" content="noindex" />', "canonical");
writeFileSync(new URL("404.html", dist), missing);

// --- sitemap
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  new URL("sitemap.xml", dist),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod></url>
  <url><loc>${SITE}/about</loc><lastmod>${today}</lastmod></url>
</urlset>
`,
);

console.log("pages: about/index.html, 404.html, sitemap.xml");
