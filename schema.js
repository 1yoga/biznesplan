const { pgTable, text, jsonb, uuid, timestamp, boolean, integer} = require('drizzle-orm/pg-core');

const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  form_type: text('form_type').notNull(), // form1, form2
  form_data: jsonb('form_data').notNull(),
  status: text('status').notNull().default('pending'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  paid_at: timestamp('paid_at'),
  sent_at: timestamp('sent_at'),
  is_paid: boolean('is_paid').default(false),
  yookassa_payment_id: text('yookassa_payment_id'),
  yookassa_status: text('yookassa_status'),
});

const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  order_id: uuid('order_id').notNull().references(() => orders.id),
  doc_type: text('doc_type').notNull().default('business_plan'),
  status: text('status').notNull().default('pending'),
  gpt_prompt: text('gpt_prompt'),
  gpt_response: text('gpt_response'),
  file_url: text('file_url'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

const sections = pgTable('sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  document_id: uuid('document_id').notNull().references(() => documents.id),
  index: integer('index').notNull(), // 1, 2, 3...
  title: text('title').notNull(), // Краткое резюме
  prompt: text('prompt').notNull(), // user message
  gpt_response: text('gpt_response'),
  status: text('status').notNull().default('pending'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

module.exports = { plans, orders, documents, sections };
