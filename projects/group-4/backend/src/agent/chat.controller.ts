import { BadRequestException, Body, Inject, Controller, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import { ChatReply, ChatTurn } from './agent.service';
import { AGENT, ChatAgent } from './chat-agent';
import { ChatUnavailable } from './llm';

@Controller()
export class ChatController {
  constructor(@Inject(AGENT) private readonly agent: ChatAgent) {}

  @Post('chat')
  @HttpCode(200)
  async chat(@Body() body: { messages?: unknown; studentId?: unknown } | undefined): Promise<ChatReply> {
    const { messages, studentId } = body ?? {};
    if (typeof studentId !== 'string' || !studentId.trim()) throw new BadRequestException('studentId is required.');
    const valid =
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string') &&
      messages[messages.length - 1].role === 'user';
    if (!valid) throw new BadRequestException('messages must be a list of { role, content } ending with a user message.');
    try {
      return await this.agent.chat(messages as ChatTurn[], studentId.trim());
    } catch (err) {
      if (err instanceof ChatUnavailable) throw new ServiceUnavailableException(err.message);
      throw new ServiceUnavailableException('The chat agent could not reach the model. Try again.');
    }
  }
}
