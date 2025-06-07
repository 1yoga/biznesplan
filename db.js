const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { orders, documents, sections } = require('./schema');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema: { orders, documents, sections } });

module.exports = { db, orders, documents, sections };
