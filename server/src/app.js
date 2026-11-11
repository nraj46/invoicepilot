'use strict';
// InvoicePilot API — Express app exposing:
//   REST:    /api/summary /api/customers /api/invoices /api/expenses ...
//   GraphQL: /graphql (same SQL data layer)
//   Chat:    POST /api/chat  (MCP tools + RAG, demo or live LLM)
//   Meta:    /api/mcp/status /api/rag/status /api/providers /api/evals
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { createHandler } = require('graphql-http/lib/use/express');
const { getDb } = require('./store');
const queries = require('./queries');
const { schema, createRoot } = require('./graphql');
const { ask } = require('./assistant');
const { runEvals } = require('./evals');
const { mcpStatus } = require('./mcp-client');
const rag = require('./rag');
const llm = require('./llm');

function createApp() {
  const db = getDb();
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'invoicepilot', business: 'BrightWeb Studio' }));

  // ---- REST API ----
  app.get('/api/summary', (req, res) => res.json(queries.getSummary(db)));
  app.get('/api/customers', (req, res) => res.json(queries.listCustomers(db)));
  app.get('/api/invoices', (req, res) => {
    const { rows } = queries.listInvoices(db, { status: req.query.status, search: req.query.search });
    res.json(rows);
  });
  app.get('/api/invoices/:id', (req, res) => {
    const inv = queries.getInvoice(db, Number(req.params.id));
    if (!inv) return res.status(404).json({ error: 'invoice not found' });
    res.json(inv);
  });
  app.get('/api/expenses', (req, res) => {
    const { rows } = queries.listExpenses(db, { category: req.query.category });
    res.json(rows);
  });
  app.get('/api/expenses/totals', (req, res) => {
    const { rows } = queries.expenseTotalsByCategory(db, { currentQuarterOnly: req.query.quarter === 'current' });
    res.json(rows);
  });

  // ---- GraphQL API (same data layer) ----
  app.all('/graphql', createHandler({ schema, rootValue: createRoot(db) }));

  // ---- Assistant ----
  app.get('/api/providers', (req, res) => res.json(llm.listProviders()));
  app.get('/api/mcp/status', async (req, res) => {
    try { res.json(await mcpStatus()); } catch (e) { res.status(500).json({ connected: false, error: e.message }); }
  });
  app.get('/api/rag/status', async (req, res) => {
    try { res.json(await rag.indexStatus()); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/chat', async (req, res) => {
    const { question, provider } = req.body || {};
    if (!question || typeof question !== 'string') return res.status(400).json({ error: 'question is required' });
    try {
      const result = await ask(question, provider);
      res.json({ question, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/evals', async (req, res) => {
    try { res.json(await runEvals(db)); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Static Angular build (local integrated mode / fallback) ----
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist', 'client', 'browser');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/|graphql).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  return app;
}

module.exports = { createApp };
