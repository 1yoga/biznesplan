const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { plans, orders, documents, sections } = require('./schema');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema: { plans, orders, documents, sections } });

module.exports = { db, plans, orders, documents, sections };
