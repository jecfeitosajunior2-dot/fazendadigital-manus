import { execSync } from "node:child_process";

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (error) {
    return String(error.stdout || error.stderr || error.message || error);
  }
}

const netstat = run("netstat -ano | findstr :3000");
const wmic = run(
  'wmic process where "name=\'node.exe\'" get ProcessId,ParentProcessId,CommandLine /FORMAT:LIST',
);

let http = null;
try {
  const res = await fetch("http://127.0.0.1:3000/", { redirect: "manual" });
  http = { status: res.status, location: res.headers.get("location") };
} catch (error) {
  http = { error: String(error.message || error) };
}

console.log(JSON.stringify({ netstat, wmic, http }, null, 2));
