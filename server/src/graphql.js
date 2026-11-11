'use strict';
// GraphQL API over the exact same SQL data layer as the REST API.
const { buildSchema } = require('graphql');
const queries = require('./queries');

const schema = buildSchema(`
  type Customer {
    id: ID!
    name: String!
    email: String
    contact: String
    invoiceCount: Int
    totalInvoiced: Float
    totalPaid: Float
    outstanding: Float
  }
  type LineItem {
    id: ID!
    description: String!
    quantity: Float!
    unitPrice: Float!
    amount: Float!
  }
  type Payment {
    id: ID!
    amount: Float!
    paidDate: String!
    method: String
  }
  type Invoice {
    id: ID!
    number: String!
    customerId: Int!
    customerName: String!
    issueDate: String!
    dueDate: String!
    status: String!
    total: Float!
    lineItems: [LineItem!]
    payments: [Payment!]
  }
  type Expense {
    id: ID!
    category: String!
    description: String!
    vendor: String
    amount: Float!
    date: String!
  }
  type CategoryTotal {
    category: String!
    count: Int!
    total: Float!
  }
  type StatusTotal {
    status: String!
    count: Int!
    total: Float!
  }
  type MonthTotal {
    month: String!
    total: Float!
  }
  type Summary {
    totalInvoiced: Float!
    totalCollected: Float!
    outstanding: Float!
    overdueAmount: Float!
    overdueCount: Int!
    expensesThisQuarter: Float!
    quarterStart: String!
    byStatus: [StatusTotal!]!
    monthlyRevenue: [MonthTotal!]!
  }
  type Query {
    summary: Summary!
    invoices(status: String, search: String): [Invoice!]!
    invoice(id: ID!): Invoice
    customers: [Customer!]!
    topCustomers(limit: Int): [Customer!]!
    expenses(category: String): [Expense!]!
    expenseTotals: [CategoryTotal!]!
  }
`);

function createRoot(db) {
  return {
    summary: () => queries.getSummary(db),
    invoices: ({ status, search }) => queries.listInvoices(db, { status, search }).rows,
    invoice: ({ id }) => queries.getInvoice(db, Number(id)),
    customers: () => queries.listCustomers(db),
    topCustomers: ({ limit }) => queries.topCustomers(db, limit || 5).rows,
    expenses: ({ category }) => queries.listExpenses(db, { category }).rows,
    expenseTotals: () => queries.expenseTotalsByCategory(db, {}).rows,
  };
}

module.exports = { schema, createRoot };
