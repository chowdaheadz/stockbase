import { pool, checkAuth, parseBody, initTables } from './_db.js';

function toRow(row) {
  return {
    id:           row.id,
    sku:          row.sku,
    name:         row.name,
    category:     row.category,
    currentStock: row.current_stock,
    reorderPoint: row.reorder_point,
    reorderQty:   row.reorder_qty,
    avgCost:      parseFloat(row.avg_cost),
  };
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  try {
    await initTables();

    // GET — return all inventory items
    if (req.method === 'GET') {
      const r = await pool.query('SELECT * FROM inventory ORDER BY sku');
      return res.status(200).json(r.rows.map(toRow));
    }

    // POST — create a single new SKU
    if (req.method === 'POST') {
      const { id, sku, name, category, currentStock, reorderPoint, reorderQty } = await parseBody(req);
      await pool.query(
        `INSERT INTO inventory (id, sku, name, category, current_stock, reorder_point, reorder_qty)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, sku, name, category || 'Uncategorized', currentStock || 0, reorderPoint || 0, reorderQty || 0]
      );
      return res.status(200).json({ success: true });
    }

    // PATCH — upsert an array of items (used for bulk stock updates)
    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      const items = Array.isArray(body) ? body : [body];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const item of items) {
          await client.query(
            `INSERT INTO inventory (id, sku, name, category, current_stock, reorder_point, reorder_qty, avg_cost, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
             ON CONFLICT (id) DO UPDATE SET
               name          = EXCLUDED.name,
               category      = EXCLUDED.category,
               current_stock = EXCLUDED.current_stock,
               reorder_point = EXCLUDED.reorder_point,
               reorder_qty   = EXCLUDED.reorder_qty,
               avg_cost      = EXCLUDED.avg_cost,
               updated_at    = NOW()`,
            [item.id, item.sku, item.name, item.category || 'Uncategorized',
             item.currentStock, item.reorderPoint, item.reorderQty, item.avgCost || 0]
          );
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
      return res.status(200).json({ success: true });
    }

    // DELETE — remove a SKU by id (?id=xxx)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.query('DELETE FROM inventory WHERE id = $1', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('inventory error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
