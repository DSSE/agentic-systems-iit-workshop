---
name: clean-exit
description: Use before ending a session, opening a PR, or the demo. Runs the ClubOps clean-exit checklist.
---
- [ ] `npm run verify` passes; `npm run evals` passes if prompts/agent changed
- [ ] `feature_list.json`, `DECISIONS.md` and the phase entry in `progress.html` updated
- [ ] Only files inside `projects/group-<N>/` changed (`git diff --name-only origin/main`)
- [ ] No `.env`, secrets, debug code, or `.state.json` committed
- [ ] `npm run reset && npm start` works from a clean clone
