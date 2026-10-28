import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (error) {
    return String(error.stdout || error.stderr || error.message || "");
  }
}

const net = run("netstat -ano | findstr :3000");
const wmic = run(
  "wmic process where \"name='node.exe'\" get ProcessId,ParentProcessId,CommandLine /FORMAT:LIST",
);

let health = null;
try {
  const r = await fetch("http://127.0.0.1:3000/api/health");
  health = { status: r.status, body: await r.json() };
} catch (error) {
  health = { error: String(error.message || error) };
}

let home = null;
try {
  const r = await fetch("http://127.0.0.1:3000/", { redirect: "manual" });
  home = { status: r.status };
} catch (error) {
  home = { error: String(error.message || error) };
}

const stdoutPath = "C:/Users/Pedro Neto/FazendaDigital-backups/homolog-fase41a/stdout.log";
const stderrPath = "C:/Users/Pedro Neto/FazendaDigital-backups/homolog-fase41a/stderr.log";
const stdout = existsSync(stdoutPath) ? readFileSync(stdoutPath, "utf8").slice(-2500) : "";
const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, "utf8").slice(-2500) : "";

console.log(JSON.stringify({ net, health, home, wmic, stdout, stderr }, null, 2));
