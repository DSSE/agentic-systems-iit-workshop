// One test per acceptance criterion in specs/agent.md. Each starts as a todo;
// replace it with a real test in the phase that builds the feature.
// Run tests on temp copies of tests/fixtures/*.json via DATA_FILE, never on data.json.
import { test } from 'node:test';

const todo = (name, phase) => test(name, { todo: `Phase ${phase}` });

// Milestone 1
todo('AC-1: list_tasks returns all tasks and each member\'s points, limit and remaining', 3);
todo('AC-2: check_capacity never writes the data file', 3);
todo('AC-3: assign_task creates a proposal and never writes the data file', 3);
todo('AC-4: only approve writes the data file, and only for a known pending proposal', 3);
todo('AC-5: C1 login + payment to two members gives a proposal; approve saves both', 3);
todo('AC-6: C2 reaching exactly 8 gives a proposal; 9 fails with MAX_POINTS_EXCEEDED', 3);
todo('AC-7: C3 all 6 tasks to Rafi fails with MAX_POINTS_EXCEEDED and nothing is saved', 3);
todo('AC-8: assign_task refuses a rule-breaking batch even if check_capacity was skipped', 3);
todo('AC-9: approve re-checks the rule and refuses if data changed', 3);
todo('AC-10: the API returns the same codes as the tools', 3);
todo('AC-11: C1-C3 work in the UI; only Approve saves', 3);

// Milestone 2
todo('AC-12: MCP server exposes the three tools and calls the domain module', 4);
todo('AC-13: two different AI clients connect to the MCP server', 4);
todo('AC-14: C1 chat agent handles case 1 in plain words', 5);
todo('AC-15: C4 chat agent asks a question back', 5);

// Milestone 3 (optional)
todo('AC-16: evals cover C1-C5 and compare two prompt versions', 6);
todo('AC-17: C5 injection is blocked from every client', 7);
