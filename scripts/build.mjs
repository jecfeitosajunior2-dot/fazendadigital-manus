import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await viteBuild({
  configFile: path.join(root, "vite.config.ts"),
  configLoader: "runner",
});
