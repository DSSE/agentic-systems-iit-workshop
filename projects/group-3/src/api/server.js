import 'dotenv/config';
import { createApp } from './app.js';
import { createStore } from '../domain/store.js';

// The chat agent arrives in phase 5. Until then /api/chat answers "not configured".
let chat;
try { ({ chatOnce: chat } = await import('../agent/chat.js')); } catch { /* agent not added yet */ }

const app = createApp({ store: createStore(), chat });
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`ClubOps running at http://localhost:${port}${chat ? '' : ' (chat agent not added yet)'}`));
