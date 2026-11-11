'use strict';
// LLMProvider abstraction. DemoLLM (deterministic, honestly labelled) is the
// default. Real providers activate purely from environment variables —
// no code changes:
//   OPENAI_API_KEY    -> OpenAI Chat Completions (function calling)
//   ANTHROPIC_API_KEY -> Anthropic Claude Messages API (tool use)
//   XAI_API_KEY       -> xAI Grok via its OpenAI-compatible API
// When a provider is selected but its key is not set, the app stays in
// Demo mode and says so — it never pretends to be live.

const PROVIDER_DEFS = [
  { id: 'demo', name: 'Demo assistant', model: 'Deterministic demo engine (no LLM)', envKey: null },
  { id: 'openai', name: 'OpenAI', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', envKey: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic Claude', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'xai', name: 'xAI Grok', model: process.env.XAI_MODEL || 'grok-4', envKey: 'XAI_API_KEY', baseUrl: 'https://api.x.ai/v1' },
];

function listProviders() {
  return PROVIDER_DEFS.map(p => {
    const live = p.envKey ? Boolean(process.env[p.envKey]) : false;
    return {
      id: p.id, name: p.name, model: p.model,
      live, mode: live ? 'live' : 'demo',
      note: p.envKey
        ? (live ? `Live — ${p.envKey} detected` : `Demo mode — set ${p.envKey} to activate`)
        : 'Demo mode — deterministic answers from live SQL/RAG results',
    };
  });
}

function resolveProvider(requestedId) {
  const defs = listProviders();
  const def = defs.find(p => p.id === requestedId) || defs[0];
  return def;
}

// --- OpenAI-compatible chat completions with tool calling (OpenAI + xAI) ---
async function openAiCompatibleGenerate(def, { system, user, tools, executeTool, toolCalls }) {
  const apiKey = process.env[def.envKey];
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const oaTools = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  for (let round = 0; round < 5; round++) {
    const res = await fetch(`${def.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: def.model, messages, tools: oaTools, tool_choice: 'auto' }),
    });
    if (!res.ok) throw new Error(`${def.name} API error: ${res.status} ${await res.text()}`);
    const json = await res.json();
    const msg = json.choices[0].message;
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (!calls.length) return msg.content || '';
    for (const call of calls) {
      const args = JSON.parse(call.function.arguments || '{}');
      const output = await executeTool(call.function.name, args);
      toolCalls.push({ name: call.function.name, args });
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(output) });
    }
  }
  return 'I gathered the data but could not compose a final answer.';
}

// --- Anthropic Messages API with tool use ---
async function anthropicGenerate(def, { system, user, tools, executeTool, toolCalls }) {
  const apiKey = process.env[def.envKey];
  const messages = [{ role: 'user', content: user }];
  const aTools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  for (let round = 0; round < 5; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: def.model, max_tokens: 1024, system, messages, tools: aTools }),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    const json = await res.json();
    messages.push({ role: 'assistant', content: json.content });
    const uses = (json.content || []).filter(b => b.type === 'tool_use');
    if (!uses.length) {
      return (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
    }
    const results = [];
    for (const use of uses) {
      const output = await executeTool(use.name, use.input || {});
      toolCalls.push({ name: use.name, args: use.input || {} });
      results.push({ type: 'tool_result', tool_use_id: use.id, content: String(output) });
    }
    messages.push({ role: 'user', content: results });
  }
  return 'I gathered the data but could not compose a final answer.';
}

// Generate an answer with real tool calling. Only called when def.live.
async function generateWithTools(def, ctx) {
  const toolCalls = [];
  const text = def.id === 'anthropic'
    ? await anthropicGenerate(def, { ...ctx, toolCalls })
    : await openAiCompatibleGenerate(def, { ...ctx, toolCalls });
  return { text, toolCalls };
}

module.exports = { listProviders, resolveProvider, generateWithTools };
