import { createPool } from '@vercel/postgres';

const db = createPool({
  connectionString: process.env.POSTGRES_URL
});

async function initDB() {
  await db.sql`
    CREATE TABLE IF NOT EXISTS app_data (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  const password = req.headers['x-app-password'];
  if (password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await initDB();

    const { key } = req.query;

    if (req.method === 'GET') {
      const result = await sql`
        SELECT value FROM app_data WHERE key = ${key}
      `;
      if (result.rows.length === 0) {
        return res.status(404).json({ value: null });
      }
      return res.status(200).json({ value: result.rows[0].value });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      console.log('POST key:', key);
      console.log('POST body:', JSON.stringify(body));
      console.log('POST value:', body.value);
      const { value } = body;
      if (value === undefined) {
        return res.status(400).json({ error: 'Missing value in body', receivedBody: body });
      }
      await db.sql`
        INSERT INTO app_data (key, value, updated_at)
        VALUES (${key}, ${JSON.stringify(value)}, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = ${JSON.stringify(value)}, updated_at = NOW()
      `;
      return res.status(200).json({ success: true });
    }