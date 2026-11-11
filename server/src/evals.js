'use strict';
// Golden-set evals for the assistant. Each case runs the REAL assistant
// (demo provider, so results are deterministic) and checks the answer
// against values computed independently, straight from SQL — nothing is
// hardcoded. Run live via GET /api/evals or in Jest.
const { ask } = require('./assistant');
const { iso, quarterStart } = require('./db');

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US');

function sqlVal(db, sql, ...params) {
  const row = db.prepare(sql).get(...params);
  return row ? Object.values(row)[0] : null;
}

const CASES = [
  {
    id: 'overdue-list',
    kind: 'data',
    question: 'Which invoices are overdue?',
    check(db, r) {
      const count = sqlVal(db, `SELECT COUNT(*) FROM invoice_totals WHERE display_status='overdue'`);
      const total = sqlVal(db, `SELECT COALESCE(SUM(total),0) FROM invoice_totals WHERE display_status='overdue'`);
      const pass = r.trace.toolCalls.some(t => t.name === 'query_overdue_invoices')
        && r.answer.includes(`${count} overdue`) && r.answer.includes(fmt(total));
      return { pass, expected: `${count} overdue invoices totalling ${fmt(total)} via MCP tool query_overdue_invoices` };
    },
  },
  {
    id: 'software-spend-quarter',
    kind: 'data',
    question: 'How much did we spend on software this quarter?',
    check(db, r) {
      const total = sqlVal(db, `SELECT COALESCE(SUM(amount),0) FROM expenses WHERE category='Software' AND expense_date >= ?`, iso(quarterStart(0)));
      const pass = r.trace.toolCalls.some(t => t.name === 'expense_totals_by_category') && r.answer.includes(fmt(total));
      return { pass, expected: `Software spending this quarter = ${fmt(total)}` };
    },
  },
  {
    id: 'biggest-customer',
    kind: 'data',
    question: 'Who is our biggest customer?',
    check(db, r) {
      const name = sqlVal(db, `SELECT c.name FROM customers c JOIN invoice_totals t ON t.customer_id=c.id GROUP BY c.id ORDER BY SUM(t.total) DESC LIMIT 1`);
      const pass = r.trace.toolCalls.some(t => t.name === 'top_customers') && r.answer.includes(name);
      return { pass, expected: `Biggest customer is ${name}` };
    },
  },
  {
    id: 'revenue-collected',
    kind: 'data',
    question: 'How much revenue have we collected?',
    check(db, r) {
      const total = sqlVal(db, `SELECT COALESCE(SUM(amount),0) FROM payments`);
      const pass = r.trace.toolCalls.some(t => t.name === 'revenue_summary') && r.answer.includes(fmt(total));
      return { pass, expected: `Collected = ${fmt(total)} (SUM of payments)` };
    },
  },
  {
    id: 'outstanding-balance',
    kind: 'data',
    question: 'What is our outstanding balance?',
    check(db, r) {
      const total = sqlVal(db, `SELECT COALESCE(SUM(total),0) FROM invoice_totals WHERE display_status IN ('pending','overdue')`);
      const pass = r.answer.includes(fmt(total));
      return { pass, expected: `Outstanding = ${fmt(total)}` };
    },
  },
  {
    id: 'biggest-expense-category',
    kind: 'data',
    question: 'What is our biggest expense category?',
    check(db, r) {
      const row = db.prepare(`SELECT category, SUM(amount) t FROM expenses GROUP BY category ORDER BY t DESC LIMIT 1`).get();
      const pass = r.trace.toolCalls.some(t => t.name === 'expense_totals_by_category')
        && r.answer.includes(row.category) && r.answer.includes(fmt(row.t));
      return { pass, expected: `Biggest expense category is ${row.category} at ${fmt(row.t)}` };
    },
  },
  {
    id: 'invoice-lookup',
    kind: 'data',
    question: 'Tell me about invoice INV-1037',
    check(db, r) {
      const row = db.prepare(`SELECT t.total, t.display_status s, c.name FROM invoice_totals t JOIN customers c ON c.id=t.customer_id WHERE t.number='INV-1037'`).get();
      const pass = r.trace.toolCalls.some(t => t.name === 'search_invoices')
        && r.answer.includes('INV-1037') && r.answer.includes(fmt(row.total)) && r.answer.includes(row.name);
      return { pass, expected: `INV-1037 = ${row.name}, ${fmt(row.total)}, ${row.s}` };
    },
  },
  {
    id: 'pending-invoices',
    kind: 'data',
    question: 'How many invoices are still pending?',
    check(db, r) {
      const count = sqlVal(db, `SELECT COUNT(*) FROM invoice_totals WHERE display_status='pending'`);
      const total = sqlVal(db, `SELECT COALESCE(SUM(total),0) FROM invoice_totals WHERE display_status='pending'`);
      const pass = r.answer.includes(`${count} invoice`) && r.answer.includes(fmt(total));
      return { pass, expected: `${count} pending invoices totalling ${fmt(total)}` };
    },
  },
  {
    id: 'rag-late-fee',
    kind: 'rag',
    question: 'What is the late fee policy?',
    check(db, r) {
      const cited = (r.trace.citations || []).map(c => c.doc);
      const pass = r.trace.path === 'rag' && cited.includes('Late Fee Policy') && r.answer.includes('1.5%');
      return { pass, expected: 'RAG answer citing "Late Fee Policy" and the 1.5% per month fee' };
    },
  },
  {
    id: 'rag-refund',
    kind: 'rag',
    question: 'Is the deposit refundable if we cancel before work begins?',
    check(db, r) {
      const cited = (r.trace.citations || []).map(c => c.doc);
      const pass = r.trace.path === 'rag' && cited.includes('Refund Policy') && /refundable/i.test(r.answer);
      return { pass, expected: 'RAG answer citing "Refund Policy" (deposit refundable in full until work begins)' };
    },
  },
];

async function runEvals(db) {
  const results = [];
  for (const c of CASES) {
    const r = await ask(c.question, 'demo');
    let outcome;
    try { outcome = c.check(db, r); } catch (e) { outcome = { pass: false, expected: 'check error: ' + e.message }; }
    results.push({
      id: c.id, kind: c.kind, question: c.question,
      pass: outcome.pass, expected: outcome.expected,
      path: r.trace.path,
      tool: (r.trace.toolCalls[0] && r.trace.toolCalls[0].name) || null,
      citations: (r.trace.citations || []).map(x => x.doc),
      answerPreview: r.answer.slice(0, 220),
    });
  }
  const passed = results.filter(x => x.pass).length;
  return { passed, total: results.length, passRate: results.length ? passed / results.length : 0, results };
}

module.exports = { runEvals, CASES };
