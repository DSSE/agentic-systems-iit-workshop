import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const production = process.argv.includes("--production");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  // Detached process groups on POSIX include npm's Node child processes.
  for (const child of children) {
    try { if (process.platform === "win32") child.kill(); else process.kill(-child.pid, "SIGTERM"); } catch { /* already exited */ }
  }
  process.exitCode = code;
}
for (const [project, command] of [["server", "start"], ["web", production ? "start" : "dev"]]) {
  const child = spawn(npm, ["run", command], { cwd: fileURLToPath(new URL(`../${project}`, import.meta.url)), stdio: "inherit", detached: process.platform !== "win32" });
  children.push(child);
  child.on("error", (error) => { console.error(`Could not start ${project}: ${error.message}`); stop(1); });
  child.on("exit", (code) => { if (!stopping) stop(code || 0); });
}
process.on("SIGINT", () => stop()); process.on("SIGTERM", () => stop());
console.log("CampusDesk UI: http://localhost:3000 · API: http://localhost:4000");
