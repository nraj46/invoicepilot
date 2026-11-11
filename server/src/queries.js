'use strict';
// Shared SQL query helpers used by the REST API, the GraphQL resolvers,
// the MCP tools and the evals. Every number is computed in SQL.
const { quarterStart, iso } = require('./db');

const INVOICE_SELECT = `
  SELECT t.id, t.number, t.customer_id AS customerId, c.name AS customerName,
         t.issue_date AS issueDate, t.due_date AS dueDate,
         t.display_status AS status, t.total
  FROM invoice_totals t
  JOIN customers c ON c.id = t.customer_id`;

function getSummary(db) {
  const qStart = iso(quarterStart(0));
  const totals = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(total), 0) FROM invoice_totals) AS totalInvoiced,
      (SELECT COALESCE(SUM(amount), 0) FROM payments) AS totalCollected,
      (SELECT COALESCE(SUM(total), 0) FROM invoice_totals WHERE display_status IN ('pending','overdue')) AS outstanding,
      (SELECT COALESCE(SUM(total), 0) FROM invoice_totals WHERE display_status = 'overdue') AS overdueAmount,
      (SELECT COUNT(*) FROM invoice_totals WHERE display_status = 'overdue') AS overdueCount,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date >= ?) AS expensesThisQuarter
  `).get(qStart);
  const byStatus = db.prepare(`
    SELECT display_status AS status, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
    FROM invoice_totals GROUP BY display_status
  `).all();
  const monthlyRevenue = db.prepare(`
    SELECT substr(paid_date, 1, 7) AS month, SUM(amount) AS total
    FROM payments GROUP BY month ORDER BY month
  `).all();
  return { ...totals, byStatus, monthlyRevenue, quarterStart: qStart };
}

function listInvoices(db, { status, search } = {}) {
  let sql = INVOICE_SELECT;
  const where = [];
  const params = [];
  if (status && status !== 'all') { where.push('t.display_status = ?'); params.push(status); }
  if (search) { where.push('(t.number LIKE ? OR c.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY t.due_date DESC';
  return { sql, rows: db.prepare(sql).all(...params) };
}

function getInvoice(db, id) {
  const inv = db.prepare(INVOICE_SELECT + ' WHERE t.id = ?').get(id);
  if (!inv) return null;
  inv.lineItems = db.prepare(`
    SELECT id, description, quantity, unit_price AS unitPrice, quantity * unit_price AS amount
    FROM line_items WHERE invoice_id = ? ORDER BY id
  `).all(id);
  inv.payments = db.prepare(`
    SELECT id, amount, paid_date AS paidDate, method FROM payments WHERE invoice_id = ? ORDER BY paid_date
  `).all(id);
  return inv;
}

function listCustomers(db) {
  return db.prepare(`
    SELECT c.id, c.name, c.email, c.contact,
      COUNT(DISTINCT t.id) AS invoiceCount,
      COALESCE(SUM(t.total), 0) AS totalInvoiced
    FROM customers c
    LEFT JOIN invoice_totals t ON t.customer_id = c.id
    GROUP BY c.id ORDER BY totalInvoiced DESC
  `).all();
}

function topCustomers(db, limit = 5) {
  const sql = `
    SELECT c.id, c.name,
      COALESCE(SUM(t.total), 0) AS totalInvoiced,
      COALESCE(SUM(CASE WHEN t.display_status = 'paid' THEN t.total ELSE 0 END), 0) AS totalPaid,
      COALESCE(SUM(CASE WHEN t.display_status IN ('pending','overdue') THEN t.total ELSE 0 END), 0) AS outstanding
    FROM customers c
    LEFT JOIN invoice_totals t ON t.customer_id = c.id
    GROUP BY c.id ORDER BY totalInvoiced DESC LIMIT ?`;
  return { sql, rows: db.prepare(sql).all(limit) };
}

function listExpenses(db, { category } = {}) {
  let sql = `SELECT id, category, description, vendor, amount, expense_date AS date FROM expenses`;
  const params = [];
  if (category) { sql += ' WHERE category = ?'; params.push(category); }
  sql += ' ORDER BY expense_date DESC';
  return { sql, rows: db.prepare(sql).all(...params) };
}

function expenseTotalsByCategory(db, { currentQuarterOnly = false } = {}) {
  let sql = `SELECT category, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
             FROM expenses`;
  const params = [];
  if (currentQuarterOnly) { sql += ' WHERE expense_date >= ?'; params.push(iso(quarterStart(0))); }
  sql += ' GROUP BY category ORDER BY total DESC';
  return { sql, rows: db.prepare(sql).all(...params) };
}

function overdueInvoices(db) {
  const sql = INVOICE_SELECT + `
    WHERE t.display_status = 'overdue' ORDER BY t.due_date ASC`;
  return { sql, rows: db.prepare(sql).all() };
}

function searchInvoices(db, term) {
  const like = `%${term}%`;
  const sql = INVOICE_SELECT + `
    WHERE t.number LIKE ? OR c.name LIKE ? OR t.display_status = ?
    ORDER BY t.due_date DESC`;
  return { sql, rows: db.prepare(sql).all(like, like, String(term).toLowerCase()) };
}

module.exports = {
  getSummary, listInvoices, getInvoice, listCustomers, topCustomers,
  listExpenses, expenseTotalsByCategory, overdueInvoices, searchInvoices,
};
