#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const [, , envFile, entry, ...args] = process.argv;
if (!envFile || !entry) {
  console.error("Usage: node scripts/run-with-env.mjs <env-file> <entry> [args...]");
  process.exit(2);
}
const file = path.resolve(envFile);
if (!existsSync(file)) {
  console.error(`Missing ${envFile}. Copy the matching .example file and fill local values.`);
  process.exit(1);
}
const env = { ...process.env };
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(trimmed);
  if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
const child = spawn(process.execPath, [path.resolve(entry), ...args], { env, stdio: "inherit" });
child.on("exit", (code, signal) => signal ? process.kill(process.pid, signal) : process.exit(code ?? 1));
