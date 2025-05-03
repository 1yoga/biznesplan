const { pgTable, uuid, text, jsonb, timestamp } = require('drizzle-orm/pg-core');

const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  formData: jsonb('form_data').notNull(),
  status: text('status')
    .notNull()
    .default('pending'),
  fileUrl: text('file_url'),
  gptPrompt: text('gpt_prompt'),
  gptResponse: text('gpt_response'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
});

module.exports = { plans };
