import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentConfigError, createAgent } from './agent.js';
import { BUDGET_CAP_EXCEEDED, INVALID_REQUEST, NOT_APPROVED, RuleError, UNKNOWN_VENDOR } from './domain.js';
import { approveProposal, createProposal, listProposals, rejectProposal } from './proposals.js';
import { budgetSummary, checkBudget, listVendors } from './tools.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const statusByCode = {
  [BUDGET_CAP_EXCEEDED]: 422,
  [INVALID_REQUEST]: 400,
  [UNKNOWN_VENDOR]: 404,
  [NOT_APPROVED]: 403,
};

function validHistory(messages) {
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 40 &&
    messages.every((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string') &&
    messages.at(-1).role === 'user'
  );
}

export function createApp({ agent = createAgent() } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.static(publicDir));

  app.post('/api/chat', async (req, res, next) => {
    if (!validHistory(req.body?.messages)) {
      return res.status(400).json({ error: { code: INVALID_REQUEST, message: 'Send messages as [{role, content}] ending with a user message.' } });
    }
    try {
      res.json(await agent.chat(req.body.messages.map(({ role, content }) => ({ role, content }))));
    } catch (err) {
      if (err instanceof AgentConfigError) return res.status(503).json({ error: { code: 'AGENT_NOT_CONFIGURED', message: err.message } });
      console.error(err);
      res.status(502).json({ error: { code: 'AGENT_FAILED', message: err.message } });
    }
  });

  app.get('/api/vendors', (req, res) => res.json(listVendors()));
  app.get('/api/budget', (req, res) => res.json(budgetSummary()));
  app.post('/api/check', (req, res) => res.json(checkBudget(req.body ?? {})));
  app.get('/api/proposals', (req, res) => res.json(listProposals()));
  app.post('/api/proposals', (req, res) => res.status(201).json(createProposal(req.body ?? {})));
  app.post('/api/proposals/:id/approve', (req, res) => res.json(approveProposal(req.params.id)));
  app.post('/api/proposals/:id/reject', (req, res) => res.json(rejectProposal(req.params.id)));

  app.use((err, req, res, next) => {
    if (err instanceof RuleError) {
      const status = statusByCode[err.code] ?? 400;
      return res.status(status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile(join(publicDir, '..', '.env'));
  } catch {
    // no .env: the app runs, only the chat agent is unavailable
  }
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`ClubOps running at http://localhost:${port}`));
}
