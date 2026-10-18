import { loadConfig, createModel, ModelError } from '../src/model.js';
import { TOOL_DEFINITIONS } from '../src/tool-contract.js';

// Explicit user-run diagnostic: no loan data, history, student IDs, or keys are printed.
loadConfig();
try {
  const model = createModel();
  if (!model) {
    console.log('Demo mode: configure LLM_BASE_URL and LLM_MODEL in projects/group-8/.env first.');
    process.exitCode = 1;
  } else {
    console.log('Checking the configured provider with a generic greeting and the three tool schemas. No inventory or loan records are sent.');
    const result = await model({ messages: [{ role: 'user', content: 'Say hello briefly. Do not call tools.' }], tools: TOOL_DEFINITIONS });
    console.log(result.tool_calls?.length ? 'Provider replied with a tool call. No tool was executed.' : 'Provider connection and tool-schema check passed.');
  }
} catch (error) {
  console.error(error instanceof ModelError ? `${error.code}${error.status ? ` (HTTP ${error.status})` : ''}: ${error.message}`
    : 'Model configuration is invalid. Check the API base URL, model name, and timeout settings.');
  process.exitCode = 1;
}
