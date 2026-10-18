import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const project of ["server", "web"]) {
  const result = spawnSync(npm, ["ci"], { cwd: fileURLToPath(new URL(`../${project}`, import.meta.url)), stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
