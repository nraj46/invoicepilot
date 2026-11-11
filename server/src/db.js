'use strict';
// InvoicePilot data layer — real SQL via Node's built-in SQLite (node:sqlite).
// All summary numbers in the app are computed by SQL (SUM / GROUP BY / JOIN),
// never hardcoded. Seed dates are relative to "today" so statuses like
// "overdue" and periods like "this quarter" stay correct whenever it runs.
const { DatabaseSync } = require('node:sqlite');

function iso(d) { return d.toISOString().slice(0, 10); }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
function quarterStart(offsetQuarters = 0) {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + offsetQuarters;
  const year = now.getFullYear() + Math.floor(q / 4);
  const month = ((q % 4) + 4) % 4 * 3;
  return new Date(year, month, 1);
}
function quarterDay(offsetQuarters, dayOffset) {
  const d = quarterStart(offsetQuarters);
  d.setDate(d.getDate() + dayOffset);
  const today = new Date();
  if (d > today) return iso(today);
  return iso(d);
}

const SCHEMA = `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  contact TEXT
);
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid','open'))
);
CREATE TABLE line_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL
);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  amount REAL NOT NULL,
  paid_date TEXT NOT NULL,
  method TEXT
);
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  vendor TEXT,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL
);
-- Invoice totals are never stored; they are always derived from line items.
CREATE VIEW invoice_totals AS
  SELECT i.id, i.number, i.customer_id, i.issue_date, i.due_date, i.status,
    COALESCE(SUM(li.quantity * li.unit_price), 0) AS total,
    CASE
      WHEN i.status = 'paid' THEN 'paid'
      WHEN i.due_date < date('now') THEN 'overdue'
      ELSE 'pending'
    END AS display_status
  FROM invoices i
  LEFT JOIN line_items li ON li.invoice_id = i.id
  GROUP BY i.id;
`;

const CUSTOMERS = [
  ['Northwind Traders', 'hello@northwindtraders.com', 'Maria Chen'],
  ['Blue Peak Outdoors', 'ap@bluepeakoutdoors.com', 'Dan Whitaker'],
  ['Café Aroma', 'owner@cafearoma.com', 'Sofia Marino'],
  ['Summit Dental', 'office@summitdental.com', 'Dr. Patel'],
  ['GreenLeaf Realty', 'accounts@greenleafrealty.com', 'Tom Becker'],
  ['Metro Fitness', 'billing@metrofitness.com', 'Alicia Gomez'],
  ['Harbor Legal', 'finance@harborlegal.com', 'James Orr'],
  ['PixelPlay Games', 'ops@pixelplaygames.com', 'Kenji Sato'],
];

// [customerIndex, issueDaysAgo, dueDaysFromNow, status, [[description, qty, unitPrice], ...]]
const INVOICES = [
  [0, -95, -81, 'paid', [['Website redesign', 1, 4800], ['SEO setup', 1, 950]]],
  [0, -40, -12, 'open', [['Monthly retainer – development', 1, 2400]]],
  [0, -6, 16, 'open', [['Landing page build', 1, 1600], ['Copywriting', 2, 300]]],
  [1, -80, -66, 'paid', [['E-commerce store build', 1, 7200]]],
  [1, -30, -2, 'open', [['Product photography edits', 10, 85], ['Hosting & maintenance', 1, 240]]],
  [2, -65, -51, 'paid', [['Brand identity package', 1, 3100], ['Menu design', 1, 450]]],
  [2, -12, 10, 'open', [['Social media templates', 1, 600]]],
  [3, -88, -74, 'paid', [['Website redesign', 1, 5400], ['Online booking integration', 1, 1250]]],
  [3, -20, -6, 'open', [['Monthly retainer – support', 1, 1800]]],
  [4, -75, -61, 'paid', [['Property listing site', 1, 6900]]],
  [4, -15, 8, 'open', [['Virtual tour pages', 3, 700]]],
  [5, -58, -44, 'paid', [['Class schedule app UI', 1, 4300], ['Payment page build', 1, 1500]]],
  [5, -25, -11, 'open', [['Monthly retainer – development', 1, 2400]]],
  [6, -70, -56, 'paid', [['Website redesign', 1, 6100], ['Client intake forms', 1, 900]]],
  [6, -9, 14, 'open', [['Accessibility audit & fixes', 1, 1350]]],
  [7, -50, -36, 'paid', [['Game landing page', 1, 3900], ['Trailer page & media embeds', 1, 800]]],
  [7, -18, -4, 'open', [['Store page optimization', 1, 1750]]],
  [1, -45, -31, 'paid', [['Email campaign templates', 1, 1100], ['Analytics setup', 1, 650]]],
  [2, -100, -86, 'paid', [['Website build', 1, 5200]]],
  [5, -3, 20, 'open', [['Member portal updates', 1, 2600]]],
];

// [category, description, vendor, amount, quarterOffset, dayOffsetInQuarter]
const EXPENSES = [
  ['Software', 'Figma subscription', 'Figma', 180, 0, 2],
  ['Software', 'GitHub Team plan', 'GitHub', 240, 0, 5],
  ['Hosting', 'Vercel Pro + domains', 'Vercel', 320, 0, 8],
  ['Contractors', 'Contract designer — invoice pages', 'Upwork', 1900, 0, 12],
  ['Marketing', 'Google Ads campaign', 'Google Ads', 750, 0, 15],
  ['Office', 'Coworking space rent', 'WeWork', 950, 0, 18],
  ['Software', 'Notion + Slack plans', 'Notion', 145, 0, 20],
  ['Hosting', 'AWS hosting (studio sites)', 'AWS', 412, 0, 24],
  ['Travel', 'Client visit — Austin flights', 'United', 386, 0, 28],
  ['Marketing', 'LinkedIn ads test', 'LinkedIn', 300, 0, 30],
  ['Software', 'Adobe Creative Cloud', 'Adobe', 660, -1, 10],
  ['Contractors', 'Contract copywriter', 'Upwork', 1250, -1, 20],
  ['Office', 'Office supplies & monitors', 'Amazon', 540, -1, 30],
  ['Hosting', 'Domain renewals', 'Namecheap', 210, -1, 40],
  ['Travel', 'Design conference ticket', 'Config Conf', 499, -1, 15],
];

const PAYMENT_METHODS = ['ACH', 'Card', 'Bank transfer'];

function createDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);

  const insCustomer = db.prepare('INSERT INTO customers (name, email, contact) VALUES (?, ?, ?)');
  CUSTOMERS.forEach(c => insCustomer.run(...c));

  const insInvoice = db.prepare('INSERT INTO invoices (number, customer_id, issue_date, due_date, status) VALUES (?, ?, ?, ?, ?)');
  const insItem = db.prepare('INSERT INTO line_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
  const insPayment = db.prepare('INSERT INTO payments (invoice_id, amount, paid_date, method) VALUES (?, ?, ?, ?)');

  INVOICES.forEach((spec, i) => {
    const [ci, issueAgo, dueFromNow, status, items] = spec;
    const number = `INV-${1042 - i}`;
    const info = insInvoice.run(number, ci + 1, daysFromNow(issueAgo), daysFromNow(dueFromNow), status);
    const invoiceId = Number(info.lastInsertRowid);
    let total = 0;
    for (const [desc, qty, price] of items) { insItem.run(invoiceId, desc, qty, price); total += qty * price; }
    if (status === 'paid') {
      insPayment.run(invoiceId, total, daysFromNow(Math.min(dueFromNow + 3, -1)), PAYMENT_METHODS[i % PAYMENT_METHODS.length]);
    }
  });

  const insExpense = db.prepare('INSERT INTO expenses (category, description, vendor, amount, expense_date) VALUES (?, ?, ?, ?, ?)');
  EXPENSES.forEach(([cat, desc, vendor, amount, qOff, dOff]) =>
    insExpense.run(cat, desc, vendor, amount, quarterDay(qOff, dOff)));

  return db;
}

module.exports = { createDatabase, quarterStart, iso };
