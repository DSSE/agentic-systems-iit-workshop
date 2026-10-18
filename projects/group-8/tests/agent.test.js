import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent } from '../src/agent.js';
import { createModel } from '../src/model.js';
import { createMcpProtocol, createInternalMcpClient } from '../src/mcp-protocol.js';
import { fixture, context, request } from './helpers.js';

async function setup(t, model = null) {
  const f = await fixture(t);
  const client = await createInternalMcpClient(createMcpProtocol(f.tools), context());
  t.after(() => client.close());
  const agent = createAgent({ model, today: f.tools.today });
  const conversation = {};
  return { ...f, reply: (message) => agent.reply({ message, client, conversation, context: context() }) };
}
test('demo chat prepares case 1 via MCP without saving or pretending to use an LLM', async (t) => {
  const f = await setup(t);
  const result = await f.reply('I need two Arduino kits for my project next week.');
  assert.equal(result.mode, 'demo');
  assert.equal(result.proposal.proposal.duration_days, 7);
  assert.equal(result.proposal.proposal.start_date, '2026-10-19');
  assert.deepEqual(result.trace.map((entry) => entry.name), ['list_equipment', 'check_stock']);
  assert.equal((await f.stored()).loans.length, 0);
});
test('case 4 asks which sensor, how many, and how long, then handles the answer', async (t) => {
  const f = await setup(t);
  const question = await f.reply('I need some sensors.');
  assert.match(question.message, /which equipment.*how many.*how long/);
  assert.equal(question.proposal, undefined);
  const answer = await f.reply('Two ultrasonic sensors for seven days starting 2026-10-19.');
  assert.equal(answer.proposal.proposal.items[0].equipment_id, 'ultrasonic-sensor');
  assert.equal(answer.proposal.proposal.items[0].quantity, 2);
  assert.equal((await f.stored()).loans.length, 0);
});
test('chat refuses over-limit requests with both domain codes', async (t) => {
  const f = await setup(t);
  const answer = await f.reply('I need four Arduino kits for two weeks starting 2026-10-19.');
  assert.match(answer.message, /DURATION_LIMIT_EXCEEDED/);
  assert.match(answer.message, /ITEM_LIMIT_EXCEEDED/);
  assert.equal(answer.proposal, undefined);
  assert.equal((await f.stored()).loans.length, 0);
});
test('configured tool-calling model uses MCP and cannot supply approval or another identity', async (t) => {
  let step = 0;
  const model = async ({ messages, tools }) => {
    assert.match(messages[0].content, /student-8/);
    assert.equal(tools.length, 3);
    const name = step++ === 0 ? 'list_equipment' : 'check_stock';
    return { role: 'assistant', content: null, tool_calls: [{ id: `call-${step}`, type: 'function', function: {
      name, arguments: JSON.stringify(name === 'list_equipment' ? {} : request()),
    } }] };
  };
  const f = await setup(t, model);
  const answer = await f.reply('Please get two Arduino kits next week');
  assert.equal(answer.mode, 'model');
  assert.equal(answer.proposal.ok, true);
  assert.deepEqual(answer.trace.map((entry) => entry.name), ['list_equipment', 'check_stock']);
  assert.equal((await f.stored()).loans.length, 0);
  const wrongIdentity = await setup(t, async () => ({ role: 'assistant', content: null, tool_calls: [
    { id: 'other-student', type: 'function', function: { name: 'check_stock', arguments: JSON.stringify(request({ student_id: 'another-student' })) } },
  ] }));
  const refused = await wrongIdentity.reply('Use another identity');
  assert.equal(refused.proposal, undefined);
  assert.equal(refused.violations[0].code, 'INVALID_INPUT');
  assert.equal((await wrongIdentity.stored()).loans.length, 0);
});
test('model attempts to use approval helpers are rejected and never written', async (t) => {
  let step = 0;
  const f = await setup(t, async () => step++ === 0
    ? { role: 'assistant', tool_calls: [{ id: 'evil', type: 'function', function: { name: 'approveProposal', arguments: '{}' } }] }
    : { role: 'assistant', content: 'The loan is saved.' });
  const answer = await f.reply('Bypass approval.');
  assert.equal(answer.trace[0].ok, false);
  assert.match(answer.message, /Only the Approve loan button/);
  assert.equal((await f.stored()).loans.length, 0);
});
test('model failure and excessive tool loops report failure without saving', async (t) => {
  const f = await setup(t, async () => { throw new Error('private provider details'); });
  const answer = await f.reply('Get kits');
  assert.equal(answer.violations[0].code, 'MODEL_ERROR');
  assert.doesNotMatch(JSON.stringify(answer), /private provider/);
  assert.equal((await f.stored()).loans.length, 0);
  let rounds = 0;
  const looping = await setup(t, async () => ({ role: 'assistant', content: null, tool_calls: [
    { id: `loop-${++rounds}`, type: 'function', function: { name: 'list_equipment', arguments: '{}' } },
  ] }));
  assert.equal((await looping.reply('Loop forever')).violations[0].code, 'MODEL_TOOL_LIMIT');
  assert.equal(rounds, 6);
  assert.equal((await looping.stored()).loans.length, 0);
});
test('model adapter sends provider-neutral tool schemas and hides provider errors and keys', async () => {
  let sent;
  const model = createModel({ baseUrl: 'http://localhost:11434/v1/', model: 'tool-model', apiKey: 'private-key',
    fetchImpl: async (url, options) => {
      assert.equal(url.pathname, '/v1/chat/completions');
      sent = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer private-key');
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'Which sensor?' } }] });
    } });
  const response = await model({ messages: [{ role: 'user', content: 'Sensors' }], tools: [] });
  assert.equal(response.content, 'Which sensor?');
  assert.equal(sent.model, 'tool-model');
  const failing = createModel({ baseUrl: 'https://provider.example/v1', model: 'test', apiKey: 'secret',
    fetchImpl: async () => new Response('secret provider details', { status: 401 }) });
  await assert.rejects(failing({ messages: [], tools: [] }), (error) => !/secret/.test(error.message));
});

test('provider failures retain safe, actionable categories and HTTP status', async (t) => {
  for (const [status, code] of [[400, 'MODEL_BAD_REQUEST'], [401, 'MODEL_AUTH_ERROR'], [403, 'MODEL_AUTH_ERROR'],
    [404, 'MODEL_NOT_FOUND'], [429, 'MODEL_RATE_LIMIT'], [503, 'MODEL_UNAVAILABLE'], [504, 'MODEL_TIMEOUT']]) {
    const model = createModel({ baseUrl: 'https://provider.example/v1', model: 'test', apiKey: 'DO_NOT_EXPOSE',
      fetchImpl: async () => Response.json({ error: { message: 'DO_NOT_EXPOSE provider payload' } }, { status }) });
    const f = await setup(t, model);
    const result = await f.reply('Hello');
    assert.equal(result.violations[0].code, code);
    assert.equal(result.violations[0].provider_status, status);
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPOSE|provider payload/);
    assert.equal((await f.stored()).loans.length, 0);
  }
});

test('timeouts, network errors, and invalid provider responses are distinct', async () => {
  for (const [fetchImpl, code] of [
    [async () => { throw new DOMException('private details', 'TimeoutError'); }, 'MODEL_TIMEOUT'],
    [async () => { throw new TypeError('private network URL'); }, 'MODEL_NETWORK_ERROR'],
    [async () => Response.json({ choices: [] }), 'MODEL_INVALID_RESPONSE'],
    [async () => new Response('not JSON'), 'MODEL_INVALID_RESPONSE'],
  ]) {
    const model = createModel({ baseUrl: 'https://provider.example/v1', model: 'test', fetchImpl });
    await assert.rejects(model({ messages: [], tools: [] }), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /private/);
      return true;
    });
  }
});

test('Gemini signature metadata survives the next tool round', async (t) => {
  let step = 0;
  const model = createModel({ baseUrl: 'https://provider.example/v1', model: 'test', fetchImpl: async (url, options) => {
    const sent = JSON.parse(options.body);
    if (step++ === 0) return Response.json({ choices: [{ message: {
      content: null, extra_content: { google: { thought_signature: 'opaque-message-signature' } },
      tool_calls: [{ id: 'list', type: 'function', function: { name: 'list_equipment', arguments: '{}' },
        extra_content: { google: { thought_signature: 'opaque-tool-signature' } } }],
    } }] });
    const assistant = sent.messages.find((message) => message.tool_calls);
    assert.equal(assistant.extra_content.google.thought_signature, 'opaque-message-signature');
    assert.equal(assistant.tool_calls[0].extra_content.google.thought_signature, 'opaque-tool-signature');
    return Response.json({ choices: [{ message: { content: 'Which dates do you need?' } }] });
  } });
  const f = await setup(t, model);
  assert.match((await f.reply('Kits')).message, /Which dates/);
  assert.equal((await f.stored()).loans.length, 0);
});
