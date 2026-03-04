import { pool, checkAuth, parseBody, initTables } from './_db.js';

function toRow(row) {
  return {
    id:         row.id,
    orderId:    row.order_id,
    sku:        row.sku,
    skuId:      row.sku_id,
    skuName:    row.sku_name,
    qty:        row.qty,
    importedAt: row.imported_at,
    orderDate:  row.order_date ? new Date(row.order_date).toISOString().slice(0, 10) : null,
    week:       row.week      ? new Date(row.week).toISOString().slice(0, 10)       : null,
  };
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  try {
    await initTables();

    // GET — return all order lines, newest first
    if (req.method === 'GET') {
      const r = await pool.query('SELECT * FROM orders ORDER BY order_date DESC, id');
      return res.status(200).json(r.rows.map(toRow));
    }

    // POST — batch insert new order lines (ignores duplicates)
    if (req.method === 'POST') {
      const lines = await parseBody(req);
      if (!Array.isArray(lines) || !lines.length) return res.status(200).json({ success: true });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const l of lines) {
          await client.query(
            `INSERT INTO orders (id, order_id, sku, sku_id, sku_name, qty, imported_at, order_date, week)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (id) DO NOTHING`,
            [l.id, l.orderId, l.sku, l.skuId, l.skuName, l.qty,
             l.importedAt, l.orderDate || null, l.week]
          );
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('orders error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
