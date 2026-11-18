// The Vercel Function behind every /api/* address (see the rewrite in vercel.json).
// The code lives in server/; `npm run build` bundles it into _bundle.js next to this file.
// Files in api/ that start with an underscore are not turned into functions of their own.
export { default } from "./_bundle.js";
