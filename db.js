const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { plans } = require('./schema');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema: { plans } });

module.exports = { db, plans };
