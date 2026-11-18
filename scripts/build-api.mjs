// Bundles the server (server/vercel.ts and everything it imports) into one file, api/_bundle.js,
// which the Vercel Function in api/index.js re-exports. One self-contained file means the
// function does not depend on how the host compiles TypeScript or finds node_modules.
import { build } from "esbuild";

const result = await build({
  entryPoints: ["server/vercel.ts"],
  outfile: "api/_bundle.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // pg's optional native driver; never installed here.
  external: ["pg-native"],
  // Some dependencies are CommonJS and call require() for Node's own modules.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  // Smaller to load on a cold start; names are kept so stack traces stay readable.
  minifyWhitespace: true,
  minifySyntax: true,
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`api: api/_bundle.js ${(bytes / 1024).toFixed(0)} kB`);
