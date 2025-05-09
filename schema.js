const { pgTable, text, jsonb, uuid, timestamp, boolean} = require('drizzle-orm/pg-core');

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
  yookassa_payment_id: text('yookassa_payment_id'),
  yookassa_status: text('yookassa_status'),
  is_paid: boolean('is_paid').default(false),
  paid_at: timestamp('paid_at'),
  sent_at: timestamp('sent_at'),
});

module.exports = { plans };
