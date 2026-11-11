'use strict';
const { createDatabase, iso, quarterStart } = require('../src/db');
const queries = require('../src/queries');
const { TOOLS, getTool } = require('../src/tools');
const { chunkDoc } = require('../src/rag');
const { DOCS } = require('../src/knowledge');

describe('seed data', () => {
  const db = createDatabase();
  test('has 8 customers, 20 invoices, 15 expenses, 10 payments', () => {
    const n = t => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    expect(n('customers')).toBe(8);
    expect(n('invoices')).toBe(20);
    expect(n('expenses')).toBe(15);
    expect(n('payments')).toBe(10);
  });
  test('invoice totals in the view equal SUM(quantity*unit_price) of line items', () => {
    const bad = db.prepare(`
      SELECT t.id FROM invoice_totals t
      WHERE ABS(t.total - (SELECT COALESCE(SUM(quantity*unit_price),0) FROM line_items li WHERE li.invoice_id = t.id)) > 0.001
    `).all();
    expect(bad.length).toBe(0);
  });
  test('collected payments equal the total of paid invoices', () => {
    const collected = db.prepare('SELECT SUM(amount) s FROM payments').get().s;
    const paid = db.prepare(`SELECT SUM(total) s FROM invoice_totals WHERE display_status='paid'`).get().s;
    expect(collected).toBeCloseTo(paid, 2);
  });
});

describe('summary (SQL-computed)', () => {
  const db = createDatabase();
  test('summary matches independent raw SQL', () => {
    const s = queries.getSummary(db);
    expect(s.totalCollected).toBe(db.prepare('SELECT SUM(amount) x FROM payments').get().x);
    expect(s.overdueCount).toBe(db.prepare(`SELECT COUNT(*) x FROM invoice_totals WHERE display_status='overdue'`).get().x);
    expect(s.totalInvoiced).toBe(db.prepare('SELECT SUM(total) x FROM invoice_totals').get().x);
  });
  test('software spending this quarter matches raw SQL', () => {
    const { rows } = queries.expenseTotalsByCategory(db, { currentQuarterOnly: true });
    const software = rows.find(r => r.category === 'Software');
    const raw = db.prepare(`SELECT SUM(amount) x FROM expenses WHERE category='Software' AND expense_date >= ?`).get(iso(quarterStart(0))).x;
    expect(software.total).toBe(raw);
  });
});

describe('tools', () => {
  const db = createDatabase();
  test('all five tools exist and return SQL + data', () => {
    expect(TOOLS.map(t => t.name).sort()).toEqual([
      'expense_totals_by_category', 'query_overdue_invoices', 'revenue_summary', 'search_invoices', 'top_customers',
    ]);
    for (const t of TOOLS) {
      const r = t.run(db, t.name === 'search_invoices' ? { query: 'INV' } : {});
      expect(typeof r.sql).toBe('string');
      expect(r.sql.length).toBeGreaterThan(10);
      expect(r.data).toBeTruthy();
    }
  });
  test('overdue tool agrees with SQL', () => {
    const r = getTool('query_overdue_invoices').run(db);
    const raw = db.prepare(`SELECT COUNT(*) c, SUM(total) t FROM invoice_totals WHERE display_status='overdue'`).get();
    expect(r.data.count).toBe(raw.c);
    expect(r.data.total).toBe(raw.t);
  });
});

describe('knowledge base', () => {
  test('has 10 documents that chunk into 20+ chunks', () => {
    expect(DOCS.length).toBe(10);
    const chunks = DOCS.flatMap(chunkDoc);
    expect(chunks.length).toBeGreaterThanOrEqual(20);
    expect(chunks.every(c => c.docTitle && c.text.length > 20)).toBe(true);
  });
});

describe('MCP server', () => {
  test('lists the five tools and answers a tool call over MCP', async () => {
    const { mcpStatus, callMcpTool } = require('../src/mcp-client');
    const status = await mcpStatus();
    expect(status.connected).toBe(true);
    expect(status.serverName).toBe('invoicepilot-data-tools');
    expect(status.tools.map(t => t.name).sort()).toEqual(TOOLS.map(t => t.name).sort());
    const r = await callMcpTool('revenue_summary', {});
    expect(r.data.totalCollected).toBeGreaterThan(0);
  }, 20000);
});

describe('assistant + evals', () => {
  const { getDb } = require('../src/store');
  test('data question is answered via an MCP tool with correct numbers', async () => {
    const { ask } = require('../src/assistant');
    const r = await ask('Which invoices are overdue?', 'demo');
    expect(r.trace.path).toBe('mcp-tool');
    expect(r.trace.toolCalls[0].via).toBe('mcp');
    expect(r.trace.toolCalls[0].name).toBe('query_overdue_invoices');
    expect(r.answer).toContain('$9,440');
  }, 20000);
  test('policy question is answered via RAG with a citation', async () => {
    const { ask } = require('../src/assistant');
    const r = await ask('What is the late fee policy?', 'demo');
    expect(r.trace.path).toBe('rag');
    expect(r.trace.citations.map(c => c.doc)).toContain('Late Fee Policy');
    expect(r.answer).toContain('1.5%');
  }, 20000);
  test('evals pass 10/10', async () => {
    const { runEvals } = require('../src/evals');
    const out = await runEvals(getDb());
    expect(out.total).toBe(10);
    expect(out.passed).toBe(10);
  }, 30000);
});
