# Workflow

## Role sequence
1. **Planner** (`../agents/planner.md`) reads the spec and `state.md`, and writes/updates the ordered task list.
2. **Generator** (`../agents/generator.md`) takes the top task, implements it, tests it, and moves it to "Awaiting review".
3. **Evaluator** (`../agents/evaluator.md`) independently checks the task against the acceptance criteria and either moves it to "Done" or sends it back with a specific defect.
4. Repeat from step 2 for the next task. Re-run the planner whenever the task list runs low or the milestone/phase changes.

## Review gates
- A task may not move to "Done" except via the evaluator.
- A task that touches the hard rule, the approval flow, or writes to `data.json` needs an explicit pass/fail note from the evaluator on both the boundary case (8 points) and the breaking case (9 points) before it can close.
- Nothing in the app saves to `data.json` without a human Approve — this is a product rule, not just a review rule, and the evaluator checks for it on every relevant task.

## Failure / resume procedure
- If the evaluator rejects a task: the generator re-reads the specific defect in `state.md`, fixes only that, and resubmits. Don't restart the whole task from scratch unless the defect is structural.
- If a session ends mid-task: the next session reads `state.md` first — it says whose turn it is and what's in flight. Resume from there instead of re-reading the full spec from scratch.
- If the planner's breakdown turns out wrong once work starts (a task was bigger than expected, or depends on something not yet built): stop, update `state.md` to split or reorder it, and continue — don't silently expand the scope of an existing task.
