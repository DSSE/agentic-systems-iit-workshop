import { randomUUID } from "node:crypto";
import { requireRole } from "../auth.js";
import { connectLocalMcp } from "../mcp.js";
import { runAgent } from "./run.js";
import { createCompletion, AgentError } from "./model.js";

export function createChat({ complete = createCompletion(), now = Date.now } = {}) {
  const conversations = new Map();
  const requests = new Map();
  return async function chat(user, input) {
    requireRole(user, "student");
    for (const [key, entry] of requests) if (entry.until <= now()) requests.delete(key);
    const rate = requests.get(user.id) || { count: 0, until: now() + 60000 };
    if (rate.count >= 12) throw new AgentError("CHAT_RATE_LIMIT", "Please wait a minute before sending more messages.", 429);
    rate.count++;
    requests.set(user.id, rate);
    if (typeof input?.message !== "string" || !input.message.trim() || input.message.length > 2000
      || Object.keys(input).some((key) => !["message", "conversation_id"].includes(key))) {
      throw new AgentError("INVALID_REQUEST", "Send a message of 1–2000 characters. Conversation history and roles are managed by the server.", 400);
    }
    for (const [id, item] of conversations) if (!item.busy && item.expires <= now()) conversations.delete(id);
    let id = input.conversation_id;
    let conversation;
    if (id) {
      conversation = conversations.get(id);
      if (!conversation || conversation.owner !== user.id) throw new AgentError("CONVERSATION_NOT_FOUND", "This chat expired. Start a new conversation.", 404);
    } else {
      if (conversations.size >= 500) throw new AgentError("CHAT_LIMIT", "Too many active conversations. Try again later.", 429);
      id = randomUUID();
      conversation = { owner: user.id, history: [], turns: 0, busy: false, expires: now() + 30 * 60000 };
      conversations.set(id, conversation);
    }
    if (conversation.busy) throw new AgentError("CHAT_BUSY", "Please wait for the previous answer.", 409);
    if (conversation.turns >= 20) throw new AgentError("CHAT_LIMIT", "Start a new conversation to continue.", 429);
    if (JSON.stringify(conversation.history).length > 100000) throw new AgentError("CHAT_LIMIT", "This conversation is full. Start a new conversation.", 429);
    conversation.busy = true;
    let connection;
    try {
      connection = await connectLocalMcp(user);
      const answer = await runAgent({ client: connection.client, complete, history: conversation.history, message: input.message.trim() });
      conversation.history = answer.history;
      conversation.turns++;
      conversation.expires = now() + 30 * 60000;
      return { conversation_id: id, text: answer.text, proposal: answer.proposal, trace: answer.trace };
    } catch (error) {
      if (!conversation.turns) conversations.delete(id);
      throw error;
    } finally { conversation.busy = false; await connection?.close(); }
  };
}
