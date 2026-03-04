import { pool, checkAuth, parseBody, initTables } from './_db.js';

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  try {
    await initTables();

    // GET — return all weekly sales rows
    if (req.method === 'GET') {
      const r = await pool.query('SELECT week, sku, units_sold FROM sales_history ORDER BY week, sku');
      return res.status(200).json(r.rows.map(row => ({
        week:      new Date(row.week).toISOString().slice(0, 10),
        sku:       row.sku,
        unitsSold: row.units_sold,
      })));
    }

    // POST — batch upsert new entries { week, sku, unitsSold }
    // Adds to existing units_sold for the same week+sku pair
    if (req.method === 'POST') {
      const entries = await parseBody(req);
      if (!Array.isArray(entries) || !entries.length) return res.status(200).json({ success: true });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const e of entries) {
          await client.query(
            `INSERT INTO sales_history (week, sku, units_sold)
             VALUES ($1, $2, $3)
             ON CONFLICT (week, sku) DO UPDATE
               SET units_sold = sales_history.units_sold + EXCLUDED.units_sold`,
            [e.week, e.sku, e.unitsSold]
          );
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('sales-history error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
