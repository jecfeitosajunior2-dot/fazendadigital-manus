import { build } from "esbuild";

await build({
  entryPoints: ["api/handler.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "api/server.js",
  packages: "external",
  logLevel: "info",
});
