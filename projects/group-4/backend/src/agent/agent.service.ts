import { Inject, Injectable } from '@nestjs/common';
import { Proposal } from '../domain/types';
import { LoansService } from '../loans/loans.service';
import { createTools, ToolDef } from '../tools/tools';
import { ChatMessage, Llm, LLM, LlmTool } from './llm';
import { systemPrompt } from './prompt';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatReply {
  reply: string;
  // Set only when the last check_stock of this turn returned ok. It comes from
  // the tool result, not from the model's words. The person saves it with the
  // Approve button.
  proposal?: Proposal;
}

const MAX_STEPS = 6;
const MAX_TURNS = 20;
const MAX_CHARS = 2000;
// create_loan is never given to the model: only the Approve button saves.
const MODEL_TOOLS = ['list_equipment', 'check_stock'];

@Injectable()
export class AgentService {
  private readonly tools: ToolDef[];

  constructor(
    @Inject(LLM) private readonly llm: Llm,
    loans: LoansService,
  ) {
    this.tools = createTools(loans).filter((t) => MODEL_TOOLS.includes(t.name));
  }

  async chat(history: ChatTurn[], studentId: string): Promise<ChatReply> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(studentId) },
      ...history.slice(-MAX_TURNS).map((t) => ({ role: t.role, content: t.content.slice(0, MAX_CHARS) })),
    ];
    const llmTools: LlmTool[] = this.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
    let proposal: Proposal | undefined;

    for (let step = 0; step < MAX_STEPS; step++) {
      const reply = await this.llm.complete(messages, llmTools);
      if (!reply.tool_calls?.length) {
        return { reply: reply.content?.trim() || 'Sorry, I have no answer for that.', proposal };
      }
      messages.push({ role: 'assistant', content: reply.content, tool_calls: reply.tool_calls });
      for (const call of reply.tool_calls) {
        const result = await this.runTool(call.function.name, call.function.arguments, studentId);
        if (call.function.name === 'check_stock') {
          const r = result as { ok?: boolean; proposal?: Proposal };
          proposal = r.ok === true ? r.proposal : undefined;
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return { reply: 'I could not finish that request. Please try again with the item, how many and for how many days.' };
  }

  private async runTool(name: string, rawArgs: string, studentId: string): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) return { error: `Unknown tool: ${name}` };
    let args: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawArgs || '{}');
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      args = parsed;
    } catch {
      return { error: 'Tool arguments must be a JSON object.' };
    }
    // The student id comes from the session, never from the model.
    if (name === 'check_stock') args.student_id = studentId;
    try {
      return await tool.run(args);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
}
