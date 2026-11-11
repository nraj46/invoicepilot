'use strict';
// The five data tools. The same implementations back the REST API demos,
// the MCP server (server/src/mcp-server.js) and the chat assistant —
// the assistant only ever reaches the data through these tools.
const queries = require('./queries');
const { iso, quarterStart } = require('./db');

function revenueSummary(db) {
  const sql = `
    SELECT
      (SELECT COALESCE(SUM(total),0) FROM invoice_totals) AS totalInvoiced,
      (SELECT COALESCE(SUM(amount),0) FROM payments) AS totalCollected,
      (SELECT COALESCE(SUM(total),0) FROM invoice_totals WHERE display_status IN ('pending','overdue')) AS outstanding,
      (SELECT COALESCE(SUM(total),0) FROM invoice_totals WHERE display_status='overdue') AS overdueAmount,
      (SELECT COUNT(*) FROM invoice_totals WHERE display_status='overdue') AS overdueCount,
      (SELECT COUNT(*) FROM invoice_totals WHERE display_status='pending') AS pendingCount,
      (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date >= '${iso(quarterStart(0))}') AS expensesThisQuarter`;
  const row = db.prepare(sql).get();
  return { sql, rows: [row], data: row };
}

const TOOLS = [
  {
    name: 'query_overdue_invoices',
    description: 'List all overdue invoices (unpaid and past their due date) with customer, amount and due date.',
    input: {},
    run(db) { const { sql, rows } = queries.overdueInvoices(db); return { sql, rows, data: { count: rows.length, total: rows.reduce((s, r) => s + r.total, 0), invoices: rows } }; },
  },
  {
    name: 'expense_totals_by_category',
    description: 'Total expenses grouped by category (Software, Hosting, Contractors, Marketing, Office, Travel). Optionally restrict to the current quarter, or to one category.',
    input: { quarter: 'optional: "current" to limit to the current quarter', category: 'optional category name filter' },
    run(db, args = {}) {
      const { sql, rows } = queries.expenseTotalsByCategory(db, { currentQuarterOnly: args.quarter === 'current' });
      const filtered = args.category ? rows.filter(r => r.category.toLowerCase() === String(args.category).toLowerCase()) : rows;
      return { sql, rows: filtered, data: { categories: filtered, grandTotal: filtered.reduce((s, r) => s + r.total, 0), scope: args.quarter === 'current' ? 'current quarter' : 'all time' } };
    },
  },
  {
    name: 'top_customers',
    description: 'Rank customers by total invoiced amount, with how much each has paid and still owes.',
    input: { limit: 'optional number of customers to return (default 5)' },
    run(db, args = {}) { const { sql, rows } = queries.topCustomers(db, Math.min(Number(args.limit) || 5, 20)); return { sql, rows, data: { customers: rows } }; },
  },
  {
    name: 'revenue_summary',
    description: 'Business totals: total invoiced, total collected, outstanding balance, overdue amount/count, pending count, and expenses this quarter — all computed in SQL.',
    input: {},
    run(db) { return revenueSummary(db); },
  },
  {
    name: 'search_invoices',
    description: 'Search invoices by invoice number (e.g. INV-1037), customer name, or status (paid / pending / overdue).',
    input: { query: 'search term: invoice number, customer name, or status' },
    run(db, args = {}) { const { sql, rows } = queries.searchInvoices(db, args.query || ''); return { sql, rows, data: { count: rows.length, invoices: rows } }; },
  },
];

function getTool(name) { return TOOLS.find(t => t.name === name); }

module.exports = { TOOLS, getTool };
