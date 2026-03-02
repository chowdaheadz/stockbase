const { sql } = require('@vercel/postgres');

// Initialize tables if they don't exist
async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS app_data (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

module.exports = async function handler(req, res) {
  // Simple shared password check
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
      const { value } = req.body;
      await sql`
        INSERT INTO app_data (key, value, updated_at)
        VALUES (${key}, ${JSON.stringify(value)}, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = ${JSON.stringify(value)}, updated_at = NOW()
      `;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });