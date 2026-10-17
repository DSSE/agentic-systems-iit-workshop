// Checks a pull request against the workshop rules:
//   1. The PR targets the default branch and comes from this repo (not a fork).
//   2. The branch is named group-<N>/<short-name>.
//   3. The PR author is a member of group N in groups.json.
//   4. Every changed file is inside projects/group-<N>/.
// Instructors listed in groups.json skip rules 2-4.
//
// This script runs from the default branch (see pr-guard.yml), so a PR
// cannot change the rules it is checked against. The PR's commits are only
// read with git diff; nothing from the PR is executed.

import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";

const env = (name, fallback = "") => process.env[name] ?? fallback;
const branch = env("BRANCH_NAME");
const author = env("AUTHOR").toLowerCase();
const baseRef = env("BASE_REF");
const defaultBranch = env("DEFAULT_BRANCH", "main");
const isFork = env("IS_FORK") === "true";
const prHead = env("PR_HEAD", "refs/remotes/pr/head");

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const config = JSON.parse(readFileSync("groups.json", "utf8"));
const lower = (list) => list.map((u) => u.toLowerCase());

const errors = [];
const notes = [];

if (baseRef !== defaultBranch) {
  errors.push(`This PR targets "${baseRef}". Open it against "${defaultBranch}" instead.`);
}
if (isFork) {
  errors.push("This PR comes from a fork. Push your branch to the workshop repo itself and open the PR from there.");
}

if (lower(config.instructors).includes(author)) {
  notes.push(`@${author} is an instructor, so the group rules are skipped.`);
} else {
  const match = /^group-([1-9][0-9]*)\/[a-z0-9][a-z0-9._-]*$/.exec(branch);
  if (!match) {
    errors.push(
      `Branch "${branch}" is not named correctly. Use group-<N>/<short-name>, ` +
        `for example group-3/add-check-tool (lowercase, no spaces).`
    );
  } else {
    const n = match[1];
    const group = config.groups[n];
    const folder = `projects/group-${n}/`;

    if (!group) {
      errors.push(`Group ${n} is not listed in groups.json. Check your group number.`);
    } else {
      if (!lower(group.members).includes(author)) {
        errors.push(`@${author} is not a member of group ${n}. Use your own group number in the branch name.`);
      }

      const base = git("merge-base", `origin/${defaultBranch}`, prHead);
      const files = git("diff", "--name-only", "--no-renames", base, prHead)
        .split("\n")
        .filter(Boolean);
      const outside = files.filter((f) => !f.startsWith(folder));

      if (files.length === 0) {
        notes.push("No changed files yet.");
      } else if (outside.length > 0) {
        errors.push(
          `Only files inside ${folder} may change. These files are outside it:\n` +
            outside.map((f) => `  - ${f}`).join("\n")
        );
      } else {
        notes.push(`${files.length} changed file(s), all inside ${folder}.`);
      }
    }
  }
}

const summary = [
  errors.length ? "## ❌ PR guard failed" : "## ✅ PR guard passed",
  ...errors.map((e) => `- ${e.replace(/\n/g, "\n  ")}`),
  ...notes.map((n) => `- ${n}`),
].join("\n");

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
process.exit(errors.length ? 1 : 0);
