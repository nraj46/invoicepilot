'use strict';
// InvoicePilot MCP server — built with the official Model Context Protocol
// TypeScript SDK (@modelcontextprotocol/sdk). It exposes the five business
// data tools over MCP; the chat assistant reaches the data ONLY through
// this server (in-process transport here; the same server could be hosted
// over stdio/HTTP for external MCP clients like Claude Code or Cursor).
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { TOOLS } = require('./tools');

const INPUT_SCHEMAS = {
  query_overdue_invoices: {},
  expense_totals_by_category: {
    quarter: z.string().optional().describe('Pass "current" to limit to the current quarter'),
    category: z.string().optional().describe('Optional category filter, e.g. "Software"'),
  },
  top_customers: {
    limit: z.number().optional().describe('How many customers to return (default 5)'),
  },
  revenue_summary: {},
  search_invoices: {
    query: z.string().describe('Invoice number, customer name, or status (paid / pending / overdue)'),
  },
};

function createMcpServer(db) {
  const server = new McpServer({ name: 'invoicepilot-data-tools', version: '1.0.0' });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: INPUT_SCHEMAS[tool.name] || {} },
      async (args) => {
        const result = tool.run(db, args || {});
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
    );
  }
  return server;
}

module.exports = { createMcpServer };
