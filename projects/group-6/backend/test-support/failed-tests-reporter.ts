import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Reporter, TestModule } from "vitest/node";

export interface FailedTestRecord {
  file: string;
  test: string;
  fullName: string;
  errors: { message: string; expected?: string; actual?: string; stack?: string }[];
}

export interface FailedTestsReport {
  generatedAt: string;
  failureCount: number;
  failures: FailedTestRecord[];
}

const OUTPUT_PATH = path.resolve(import.meta.dirname, "../test-results/failed-tests.json");

// Collects every failed test from a vitest run and writes it to a JSON file so a
// later session (human or agent) can read exactly what broke without re-running
// the suite, and use it as a checklist while fixing the codebase.
export default class FailedTestsReporter implements Reporter {
  onTestRunEnd(testModules: readonly TestModule[]): void {
    const failures: FailedTestRecord[] = [];
    for (const testModule of testModules) {
      for (const test of testModule.children.allTests()) {
        const result = test.result();
        if (result.state !== "failed") continue;
        failures.push({
          file: testModule.relativeModuleId,
          test: test.name,
          fullName: test.fullName,
          errors: result.errors.map((error) => ({
            message: error.message,
            expected: error.expected,
            actual: error.actual,
            stack: error.stack,
          })),
        });
      }
    }
    const report: FailedTestsReport = { generatedAt: new Date().toISOString(), failureCount: failures.length, failures };
    mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
  }
}
