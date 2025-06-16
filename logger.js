// ./services/logger.js

const { logs } = require('./db');
const { v4: uuidv4 } = require('uuid');

async function log({ level = 'info', context = '', message = '', data = null, db }) {
    try {
        await db.insert(logs).values({
            id: uuidv4(),
            level,
            context,
            message,
            data: data ? JSON.stringify(data, null, 2) : null
        });
    } catch (err) {
        console.error('❌ Ошибка при сохранении лога:', err);
    }
}

module.exports = { log };
