// REST API for the UI. It contains no budget logic: every rule decision comes from the store.
import express from 'express';
import path from 'node:path';
import { createStore } from '../domain/store.js';

const publicDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'public');

/** @param {{store?: ReturnType<typeof createStore>, chat?: (message:string, history:any[]) => Promise<any>}} deps */
export function createApp({ store = createStore(), chat } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.static(publicDir));

  // A rule refusal is a 422 with the rule code in the body.
  const send = (res, result, okStatus = 200) => res.status(result.ok === false ? (result.code === 'NOT_FOUND' ? 404 : 422) : okStatus).json(result);

  app.get('/api/state', (_req, res) => res.json(store.getState()));
  app.get('/api/vendors', (_req, res) => res.json(store.listVendors()));
  app.post('/api/check', (req, res) => res.json(store.checkBudget(Number(req.body?.amount ?? 0))));
  app.post('/api/proposals', (req, res) => send(res, store.proposeExpense(req.body ?? {}), 201));
  app.post('/api/proposals/:id/approve', (req, res) => send(res, store.approveProposal(req.params.id)));
  app.post('/api/proposals/:id/reject', (req, res) => send(res, store.rejectProposal(req.params.id)));
  app.post('/api/reset', (_req, res) => res.json(store.reset()));

  app.post('/api/chat', async (req, res) => {
    if (!chat) return res.status(501).json({ error: 'Chat agent is not configured.' });
    const { message, history = [] } = req.body ?? {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });
    try {
      res.json(await chat(message, history));
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  return app;
}
