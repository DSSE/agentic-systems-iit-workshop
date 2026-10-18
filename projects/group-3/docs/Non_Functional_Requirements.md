# Non-Functional Requirements
- The rule holds even if the model is wrong, tricked, or replaced.
- Model independent: any OpenAI-compatible API via `.env`; runs offline with `LLM_PROVIDER=mock`.
- Demo-ready: `npm install && npm start` works from a clean clone; `npm run reset` restores demo data.
- No secrets in git; `.env` ignored.
