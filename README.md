# InvoicePilot — AI Invoice & Expense Manager

An AI-powered invoice & expense manager for a small business (demo business: **BrightWeb Studio**, a web design studio). It combines a real SQL database, both REST **and** GraphQL APIs, an MCP-connected AI assistant, RAG over the company's policy documents, pluggable LLM providers, and a live eval suite.

**Live demo:** https://invoicepilot-livid.vercel.app
**Stack:** Angular 22 · TypeScript · Node.js + Express · SQLite (`node:sqlite`) · GraphQL · Model Context Protocol (official TypeScript SDK) · Jest

> Demo data is seeded in-memory on startup (8 customers, 20 invoices, 15 expenses, 10 payments). Dates are seeded relative to "today", so overdue invoices and "this quarter" figures are always realistic. No API key is required to try it.

## Pages

| Page | What it shows |
| --- | --- |
| **Dashboard** | Business totals (invoiced, collected, outstanding, overdue, expenses this quarter), invoice status rollup, monthly revenue, top customers, overdue list — all computed live by SQL. |
| **Invoices** | Every invoice with status pills and filters — powered by the **GraphQL API**. |
| **Expenses** | Category rollups and the full expense list — powered by the **REST API**. |
| **AI Assistant** | Chat over the business data and policies: MCP tool calling for data, RAG for policies, with traces, SQL, and citations. Includes the live **MCP connection** panel and model-provider selector. |
| **Evals** | A 10-case golden set (8 data + 2 RAG) run live against the assistant, checked against independently computed SQL values. |

## Architecture

```
Angular 22 SPA ──► Express API ──► SQLite (node:sqlite, in-memory, seeded)
                      │  ├─ REST    /api/*
                      │  └─ GraphQL /graphql        (same data layer)
                      ├─► MCP client ──► MCP server "invoicepilot-data-tools"
                      │        (official @modelcontextprotocol/sdk, in-process transport)
                      ├─► RAG index (10 policy/how-to docs, chunked, embedded)
                      └─► LLM providers (demo / OpenAI / Anthropic / xAI)
```

### Data layer — real SQL, nothing hardcoded
Schema: `customers`, `invoices`, `line_items`, `payments`, `expenses`, plus a view `invoice_totals` that derives each invoice's total from its line items (`SUM(quantity * unit_price)`) and its display status (`paid` / `pending` / `overdue` from the due date). Every summary number in the app comes from SQL `SUM` / `GROUP BY` / `JOIN` queries (`server/src/queries.js`).

### MCP connection
`server/src/mcp-server.js` exposes the five data tools as an **MCP server** built with the official Model Context Protocol TypeScript SDK:

- `query_overdue_invoices`
- `expense_totals_by_category`
- `top_customers`
- `revenue_summary`
- `search_invoices`

The assistant reaches the data **only** through an MCP client (`server/src/mcp-client.js`, `InMemoryTransport` linked pair — the same server could be hosted over stdio/HTTP for external MCP clients). The Assistant page shows a live **MCP connection panel**: server name/version and the tool list fetched via `listTools` (also at `GET /api/mcp/status`). Every chat answer's trace shows the MCP tool call, its arguments, and the exact SQL that ran.

### RAG (retrieval-augmented generation)
`server/src/knowledge.js` holds 10 short business documents — Payment Terms Policy, Late Fee Policy, Expense Policy, Refund Policy, Tax & VAT Notes, and five app how-to guides. They are chunked and embedded into an in-memory vector store behind an **EmbeddingProvider** abstraction (`server/src/embeddings.js`):

- `LocalHashEmbeddingProvider` — deterministic, offline (default)
- `OpenAIEmbeddingProvider` — `text-embedding-3-small`, used automatically when `OPENAI_API_KEY` is set

Retrieval ranks by cosine similarity plus a small title-match boost. Policy/how-to questions are answered from the retrieved chunks and returned with **citation chips** (source document + relevance score). Data questions keep using the SQL tools; the trace shows which path was taken. Index status: `GET /api/rag/status`.

### LLM providers
`server/src/llm.js` is an LLMProvider abstraction. The **DemoLLM** (deterministic router + templates over the real tool/RAG results) is the default and is honestly badged **"Demo mode"** in the UI. Real providers activate purely from environment variables — no code changes:

| Provider | Env var | API |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` (model: `OPENAI_MODEL`, default `gpt-4o-mini`) | Chat Completions, function calling |
| Anthropic Claude | `ANTHROPIC_API_KEY` (model: `ANTHROPIC_MODEL`, default `claude-sonnet-4-5`) | Messages API, tool use |
| xAI Grok | `XAI_API_KEY` (model: `XAI_MODEL`, default `grok-4`) | OpenAI-compatible Chat Completions |

When a provider is selected but its key is not set, the UI shows it as **"Demo mode"** rather than pretending it is live (`GET /api/providers`). With a key set, the model itself performs the tool calling — the same MCP tools plus a `search_knowledge_base` tool for RAG — and answers are grounded in the results.

### Evals
`server/src/evals.js` runs 10 golden cases through the real assistant: 8 data questions (overdue list, software spend this quarter, biggest customer, collected revenue, outstanding balance, biggest expense category, invoice lookup, pending count) checked against values computed independently in SQL, and 2 RAG questions (late-fee policy, deposit refund) that require the correct citation and facts. Results are computed live at `GET /api/evals` and shown on the Evals page.

## API reference

REST: `GET /api/summary` · `GET /api/customers` · `GET /api/invoices?status=overdue&search=INV` · `GET /api/invoices/:id` · `GET /api/expenses` · `GET /api/expenses/totals?quarter=current` · `GET /api/mcp/status` · `GET /api/rag/status` · `GET /api/providers` · `GET /api/evals` · `POST /api/chat { question, provider }`

GraphQL (`POST /graphql`): `summary`, `invoices(status, search)`, `invoice(id)`, `customers`, `topCustomers(limit)`, `expenses(category)`, `expenseTotals`.

## Run locally

```bash
npm install                  # API + tools (root)
npm --prefix client install  # Angular app
npm start                    # API on http://localhost:3000 (serves the built SPA if present)
npm --prefix client run build  # build the Angular app
npm --prefix client start      # (optional) ng serve on :4200 with /api + /graphql proxied to :3000
npm test                     # Jest: data layer, tools, MCP, assistant, evals
```

## Deployment

Deployed on Vercel: the Angular build is served statically, and the Express app runs as a serverless function (`api/index.js`) handling `/api/*` and `/graphql` (see `vercel.json`). The SQLite database is in-memory and re-seeds per cold start, which keeps the demo data always clean.

---
Built by Nagaraju Chinthalacheruvu — Angular · Node.js · SQL · REST + GraphQL · MCP · RAG · LLM tool calling · Evals.
