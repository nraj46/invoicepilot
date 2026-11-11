'use strict';
// InvoicePilot chat assistant.
//
// Two paths, chosen per question:
//  - DATA questions  -> tools on the invoicepilot-data-tools MCP server
//    (called through a real MCP client), answers composed from live SQL.
//  - POLICY / HOW-TO questions -> RAG over the knowledge base, answers
//    grounded in retrieved chunks and returned with citations.
//
// Generation: the DemoLLM (deterministic router + templates) is the default
// and is honestly labelled "Demo mode". If an LLM provider is selected AND
// its API key is set, the real provider performs the tool calling itself
// (same MCP tools + a search_knowledge_base tool) — see llm.js.
const { callMcpTool, getMcpClient } = require('./mcp-client');
const rag = require('./rag');
const llm = require('./llm');

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US');
const fmtDate = isoStr => new Date(isoStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const CATEGORIES = ['Software', 'Hosting', 'Contractors', 'Marketing', 'Office', 'Travel'];

function classifyDataIntent(raw) {
  const q = raw.toLowerCase();
  const invMatch = raw.match(/inv[-\s]?(\d+)/i);
  if (invMatch) return { tool: 'search_invoices', args: { query: 'INV-' + invMatch[1] } };
  if (/\boverdue\b|past due|late invoices?/.test(q) && !/policy|fee/.test(q)) return { tool: 'query_overdue_invoices', args: {} };
  if (/(biggest|top|best|largest|main)\s+customer/.test(q)) return { tool: 'top_customers', args: { limit: 5 } };
  if (/expense|spend|spent|costs?\b/.test(q)) {
    const args = {};
    if (/quarter/.test(q)) args.quarter = 'current';
    const cat = CATEGORIES.find(c => q.includes(c.toLowerCase()));
    if (cat) args.category = cat;
    return { tool: 'expense_totals_by_category', args };
  }
  if (/who owes|owes us|outstanding by customer/.test(q)) return { tool: 'top_customers', args: { limit: 5 } };
  if (/(pending|unpaid|open)\b[^.]*\binvoices?\b/.test(q) || /\binvoices?\b[^.]*\b(pending|unpaid|open)\b/.test(q)) {
    return { tool: 'search_invoices', args: { query: q.includes('unpaid') || q.includes('open') ? 'pending' : 'pending' } };
  }
  if (/revenue|collected|income|earned|how much.*(made|make)|total invoiced|summary|how are we doing|outstanding|how many.*pending/.test(q)) {
    return { tool: 'revenue_summary', args: {} };
  }
  if (/\binvoices?\b/.test(q)) {
    const term = q.replace(/show|list|find|search|me|all|the|invoices?|for|about|please/g, ' ').trim();
    return { tool: 'search_invoices', args: { query: term } };
  }
  return null;
}

function looksLikePolicy(raw) {
  const q = raw.toLowerCase();
  return /polic|late fee|refund|deposit|payment terms|net\s?\d+|receipt|reimburs|\bvat\b|sales tax|\btax\b|how (do|can|to)\b|chase|chasing|cancel/.test(q);
}

// ---------- Demo-mode answer composition (from live tool/RAG results) ------
function composeDataAnswer(intent, result) {
  const d = result.data;
  switch (intent.tool) {
    case 'query_overdue_invoices': {
      if (!d.count) return 'Good news — there are no overdue invoices right now.';
      const lines = d.invoices.map(i => `• ${i.number} — ${i.customerName}: ${fmt(i.total)}, due ${fmtDate(i.dueDate)}`);
      return `There are ${d.count} overdue invoices totalling ${fmt(d.total)}:\n${lines.join('\n')}`;
    }
    case 'expense_totals_by_category': {
      if (intent.args.category) {
        const c = d.categories[0];
        if (!c) return `No ${intent.args.category} expenses found (${d.scope}).`;
        return `${c.category} spending (${d.scope}): ${fmt(c.total)} across ${c.count} expense${c.count === 1 ? '' : 's'}.`;
      }
      const lines = d.categories.map(c => `• ${c.category}: ${fmt(c.total)} (${c.count} expenses)`);
      return `Expenses by category (${d.scope}), total ${fmt(d.grandTotal)}:\n${lines.join('\n')}`;
    }
    case 'top_customers': {
      const [top, ...rest] = d.customers;
      const lines = d.customers.map((c, i) => `${i + 1}. ${c.name} — ${fmt(c.totalInvoiced)} invoiced (${fmt(c.totalPaid)} paid, ${fmt(c.outstanding)} outstanding)`);
      return `Your biggest customer is ${top.name} with ${fmt(top.totalInvoiced)} invoiced.\n${lines.join('\n')}`;
    }
    case 'revenue_summary': {
      const pendingAmount = d.outstanding - d.overdueAmount;
      return `So far BrightWeb Studio has invoiced ${fmt(d.totalInvoiced)} and collected ${fmt(d.totalCollected)}. ` +
        `Outstanding is ${fmt(d.outstanding)} — ${d.pendingCount} invoices pending (${fmt(pendingAmount)}) and ${d.overdueCount} overdue (${fmt(d.overdueAmount)}). ` +
        `Expenses this quarter: ${fmt(d.expensesThisQuarter)}.`;
    }
    case 'search_invoices': {
      if (!d.count) return `No invoices found matching "${intent.args.query}".`;
      const total = d.invoices.reduce((s, i) => s + i.total, 0);
      const lines = d.invoices.slice(0, 8).map(i => `• ${i.number} — ${i.customerName}: ${fmt(i.total)}, ${i.status} (due ${fmtDate(i.dueDate)})`);
      return `Found ${d.count} invoice${d.count === 1 ? '' : 's'} matching "${intent.args.query}" (total ${fmt(total)}):\n${lines.join('\n')}`;
    }
    default:
      return 'Here is what I found: ' + JSON.stringify(d);
  }
}

async function askDemo(question, provider) {
  const trace = { provider, path: 'help', toolCalls: [], citations: [] };
  const dataIntent = classifyDataIntent(question);
  const policy = looksLikePolicy(question);

  const useRag = policy && (!dataIntent || /how (do|can|to)\b/i.test(question) || /policy|late fee|refund|payment terms|deposit/i.test(question));
  if (useRag) {
    const hits = await rag.retrieve(question, 3);
    trace.path = 'rag';
    trace.toolCalls.push({ via: 'rag', name: 'search_knowledge_base', args: { query: question }, resultCount: hits.length });
    trace.citations = hits.map(h => ({ doc: h.docTitle, score: h.score, chunk: h.text }));
    const [top, ...support] = hits;
    let answer = `According to the ${top.docTitle}: ${top.text}`;
    if (support.length) answer += `\n\nRelated: ${support.map(h => `${h.text} (${h.docTitle})`).join(' ')}`;
    return { answer, trace };
  }

  if (dataIntent) {
    const result = await callMcpTool(dataIntent.tool, dataIntent.args);
    trace.path = 'mcp-tool';
    trace.toolCalls.push({ via: 'mcp', server: 'invoicepilot-data-tools', name: dataIntent.tool, args: dataIntent.args, sql: result.sql, rowCount: Array.isArray(result.rows) ? result.rows.length : 1 });
    return { answer: composeDataAnswer(dataIntent, result), trace };
  }

  trace.path = 'help';
  return {
    answer: 'I can answer questions about your invoices, expenses and customers — try "Which invoices are overdue?", "How much did we spend on software this quarter?" or "Who is our biggest customer?". I can also answer policy questions, like "What is the late fee policy?" or "How do I record an expense?".',
    trace,
  };
}

// ---------- Live LLM path (real tool calling when a key is set) ------------
const RAG_TOOL = {
  name: 'search_knowledge_base',
  description: 'Search the business policy & how-to knowledge base (payment terms, late fee policy, refunds, expense policy, tax/VAT notes, app how-to guides). Returns relevant chunks with their source document titles.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to look up' } }, required: ['query'] },
};

async function askLive(question, provider) {
  const trace = { provider, path: 'llm-tools', toolCalls: [], citations: [] };
  const { client } = await getMcpClient();
  const listed = await client.listTools();
  const tools = listed.tools.map(t => ({ name: t.name, description: t.description, parameters: t.inputSchema }));
  tools.push(RAG_TOOL);

  const executeTool = async (name, args) => {
    if (name === RAG_TOOL.name) {
      const hits = await rag.retrieve(args.query || question, 3);
      trace.toolCalls.push({ via: 'rag', name, args, resultCount: hits.length });
      trace.citations = hits.map(h => ({ doc: h.docTitle, score: h.score, chunk: h.text }));
      return JSON.stringify(hits.map(h => ({ source: h.docTitle, score: h.score, text: h.text })));
    }
    const result = await callMcpTool(name, args);
    trace.toolCalls.push({ via: 'mcp', server: 'invoicepilot-data-tools', name, args, sql: result.sql, rowCount: Array.isArray(result.rows) ? result.rows.length : 1 });
    return JSON.stringify(result.data);
  };

  const { text } = await llm.generateWithTools(provider, {
    system: 'You are the AI assistant inside InvoicePilot, an invoice & expense manager for BrightWeb Studio (a small web design studio). Answer using the tools: the data tools (served by the invoicepilot-data-tools MCP server) for any numbers — never invent figures — and search_knowledge_base for policy or how-to questions, citing the document title. Format money like $9,440. Be concise.',
    user: question,
    tools,
    executeTool,
  });
  trace.path = trace.citations.length && !trace.toolCalls.some(t => t.via === 'mcp') ? 'rag' : 'mcp-tool';
  return { answer: text, trace };
}

async function ask(question, providerId) {
  const provider = llm.resolveProvider(providerId);
  if (provider.live) {
    try {
      return await askLive(question, provider);
    } catch (err) {
      const demo = await askDemo(question, { ...provider, mode: 'demo', live: false });
      demo.trace.fallback = `Live provider error (${err.message}); answered in demo mode.`;
      demo.trace.provider = { ...provider, mode: 'demo', live: false };
      return demo;
    }
  }
  return askDemo(question, provider);
}

module.exports = { ask, classifyDataIntent, looksLikePolicy };
