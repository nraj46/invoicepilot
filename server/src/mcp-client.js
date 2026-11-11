'use strict';
// In-process MCP client. The assistant and the /api/mcp/status endpoint talk
// to the InvoicePilot MCP server through this client — tool discovery and
// tool calls go over the real MCP protocol (InMemoryTransport linked pair),
// not direct function calls.
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createMcpServer } = require('./mcp-server');
const { getDb } = require('./store');

let statePromise = null;

function getMcpClient() {
  if (!statePromise) {
    statePromise = (async () => {
      const server = createMcpServer(getDb());
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'invoicepilot-assistant', version: '1.0.0' }, { capabilities: {} });
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const serverVersion = client.getServerVersion();
      return { client, serverVersion };
    })();
  }
  return statePromise;
}

async function listMcpTools() {
  const { client } = await getMcpClient();
  const res = await client.listTools();
  return res.tools.map(t => ({ name: t.name, description: t.description }));
}

async function mcpStatus() {
  const { serverVersion } = await getMcpClient();
  const tools = await listMcpTools();
  return {
    connected: true,
    serverName: serverVersion ? serverVersion.name : 'invoicepilot-data-tools',
    serverVersion: serverVersion ? serverVersion.version : '1.0.0',
    transport: 'in-process (MCP InMemoryTransport)',
    protocol: 'Model Context Protocol (official TypeScript SDK)',
    tools,
  };
}

// Call a tool over MCP. Returns the tool's parsed JSON payload
// ({ sql, rows, data }) exactly as the MCP server produced it.
async function callMcpTool(name, args = {}) {
  const { client } = await getMcpClient();
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return JSON.parse(text);
}

module.exports = { getMcpClient, listMcpTools, mcpStatus, callMcpTool };
