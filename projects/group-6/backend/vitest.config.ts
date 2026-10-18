import { defineConfig } from "vitest/config";
import FailedTestsReporter from "./test-support/failed-tests-reporter";

export default defineConfig({
  test: {
    reporters: ["default", new FailedTestsReporter()],
  },
});
