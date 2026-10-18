import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fixture, scriptedCompletion } from "../tests/helpers.js";
import { scenarios, judge } from "../evals/scenarios.js";

const offline = process.argv.includes("--offline");
const f = await fixture();
const { withData } = await import("../src/data/store.js");
const { connectLocalMcp } = await import("../src/mcp.js");
const { runAgent } = await import("../src/agent/run.js");
const { createCompletion } = await import("../src/agent/model.js");
const { LLM_MODEL } = await import("../src/config.js");
const { PROMPT_VERSIONS } = await import("../src/agent/prompts.js");
const results = [];
let blocked;
try {
  await withData((data) => data.bookings.push({ id: "eval-conflict", room_id: "lab-2", start_at: "2030-01-22T11:00:00+06:00", end_at: "2030-01-22T12:00:00+06:00", group_size: 4 }));
  for (const version of PROMPT_VERSIONS) {
    for (const scenario of scenarios) {
      if (blocked) {
        results.push({ version, scenario: scenario.id, workshopCase: scenario.workshopCase, pass: null, status: "blocked", error: blocked });
        console.log(`BLOCKED ${version} ${scenario.id}: ${blocked.code}`);
        continue;
      }
      const connection = await connectLocalMcp(f.sessions[0].user, `eval-${version}`);
      const before = await readFile(f.file, "utf8");
      try {
        const complete = offline ? scenario.clarify
          ? async () => ({ role: "assistant", content: "What start time, duration, and group size do you need?" })
          : scriptedCompletion(scenario.input) : createCompletion();
        const answer = await runAgent({ client: connection.client, complete, version, message: scenario.message, now: new Date("2030-01-20T09:00:00+06:00") });
        const assessment = judge(scenario, answer, before === await readFile(f.file, "utf8"));
        results.push({ version, scenario: scenario.id, workshopCase: scenario.workshopCase, status: "assessed", ...assessment, text: answer.text, trace: answer.trace });
        console.log(`${assessment.pass ? "PASS" : "FAIL"} ${version} ${scenario.id}`);
      } catch (error) {
        const infrastructure = ["MODEL_NOT_CONFIGURED", "MODEL_AUTHENTICATION_FAILED", "MODEL_ACCESS_DENIED", "MODEL_NOT_FOUND", "MODEL_RATE_LIMIT", "MODEL_UNAVAILABLE"].includes(error.code);
        const detail = { code: error.code || "EVAL_ERROR", message: error.message };
        if (infrastructure) blocked = detail;
        results.push({ version, scenario: scenario.id, workshopCase: scenario.workshopCase, pass: infrastructure ? null : false, status: infrastructure ? "blocked" : "failed", error: detail });
        console.log(`FAIL ${version} ${scenario.id}: ${error.code || "EVAL_ERROR"}`);
      } finally { await connection.close(); }
    }
  }
  const report = { mode: offline ? "offline-contract-fixture" : "live-model", model: offline ? "scripted-test-provider" : LLM_MODEL,
    promptVersions: PROMPT_VERSIONS, evaluatedAt: new Date().toISOString(),
    note: offline ? "Tests transport, tool validation and scoring only. Does not measure model or prompt quality." : "Single-run rubric comparison; results are model-dependent, not a statistical benchmark.",
    summary: PROMPT_VERSIONS.map((version) => ({ version, passed: results.filter((row) => row.version === version && row.pass === true).length,
      assessed: results.filter((row) => row.version === version && row.status === "assessed").length,
      blocked: results.filter((row) => row.version === version && row.status === "blocked").length, total: scenarios.length })), results };
  const directory = path.resolve("../evals");
  await mkdir(directory, { recursive: true });
  const destination = path.join(directory, offline ? "contract-results.json" : "live-results.json");
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.summary));
  console.log(`Report: ${destination}`);
  if (results.some((row) => row.pass !== true)) process.exitCode = 1;
} finally { await f.clean(); }
