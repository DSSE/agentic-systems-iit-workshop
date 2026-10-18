// Requests a review from every member of the PR's group except its author.
// The group comes from the branch name group-<N>/<short-name>; members come
// from groups.json on the default branch (see request-reviewers.yml).
//
// Each reviewer is requested separately, so one username that is not a
// collaborator yet (pending invite, placeholder) does not block the others.

import { readFileSync, appendFileSync } from "node:fs";

const env = (name, fallback = "") => process.env[name] ?? fallback;
const branch = env("BRANCH_NAME");
const author = env("AUTHOR").toLowerCase();
const repo = env("REPO");
const prNumber = env("PR_NUMBER");
const token = env("GITHUB_TOKEN");

const config = JSON.parse(readFileSync("groups.json", "utf8"));
const lines = [];

const match = /^group-([1-9][0-9]*)\//.exec(branch);
const group = match && config.groups[match[1]];

if (!group) {
  lines.push(`Branch "${branch}" is not a group branch, so no reviewers were requested.`);
} else {
  const reviewers = group.members.filter((u) => u.toLowerCase() !== author);
  for (const login of reviewers) {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}/requested_reviewers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ reviewers: [login] }),
    });
    lines.push(res.ok ? `Requested @${login}` : `Skipped @${login} (HTTP ${res.status}; usually not a collaborator yet)`);
  }
}

const summary = [`## Reviewers for group ${match ? match[1] : "-"}`, ...lines.map((l) => `- ${l}`)].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
