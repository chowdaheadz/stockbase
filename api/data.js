import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
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
      const result = await pool.query('SELECT value FROM app_data WHERE key = $1', [key]);
      if (result.rows.length === 0) return res.status(404).json({ value: null });
      return res.status(200).json({ value: result.rows[0].value });
    }
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { value } = body;
      if (value === undefined) return res.status(400).json({ error: 'Missing value' });
      await pool.query(
        'INSERT INTO app_data (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
        [key, JSON.stringify(value)]
      );
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('DB error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}