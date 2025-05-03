const { pgTable, text, jsonb, uuid, timestamp } = require('drizzle-orm/pg-core');

const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  form_data: jsonb('form_data').notNull(),
  status: text('status').notNull().default('pending'),
  file_url: text('file_url'),
  gpt_prompt: text('gpt_prompt'),
  gpt_response: text('gpt_response'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

module.exports = { plans };
