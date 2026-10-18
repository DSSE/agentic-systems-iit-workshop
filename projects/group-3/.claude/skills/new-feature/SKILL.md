---
name: new-feature
description: Use when starting or implementing an item from feature_list.json in ClubOps. Enforces WIP=1, verification first, and the hard rule.
---
1. Exactly one item is `active` in `feature_list.json`. Activate the next only after the current one passes.
2. Restate its behavior and verification command. Sharpen the command if vague.
3. Write or extend the test first so it fails for the right reason.
4. Smallest change that passes. Budget logic goes in `src/domain/` only.
5. Run `npm run verify` (and `npm run evals` if the agent or prompts changed).
6. If green: set `passing` with evidence (commit hash), add the phase entry (`npm run progress -- <phase> done "..."`), commit on your `group-<N>/<name>` branch.
