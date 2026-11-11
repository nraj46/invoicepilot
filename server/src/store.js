'use strict';
// One shared in-memory database instance for the whole process
// (API, GraphQL, MCP server, assistant, evals all read the same data).
const { createDatabase } = require('./db');
let db = null;
function getDb() {
  if (!db) db = createDatabase();
  return db;
}
module.exports = { getDb };
