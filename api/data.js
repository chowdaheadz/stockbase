import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ───────────────────────────────────────────────────────────────────
async function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

async function legacyGet(key) {
  try {
    const r = await pool.query('SELECT value FROM app_data WHERE key = $1', [key]);
    return r.rows[0]?.value ?? null;
  } catch { return null; }
}

// ── Migration helpers ─────────────────────────────────────────────────────────
async function migrateInventory(client, items) {
  for (const item of items) {
    await client.query(
      `INSERT INTO inventory (id, sku, name, category, current_stock, reorder_point, reorder_qty, avg_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [item.id, item.sku, item.name, item.category || 'Uncategorized',
       item.currentStock || 0, item.reorderPoint || 0, item.reorderQty || 0, item.avgCost || 0]
    );
  }
}

async function migrateSalesHistory(client, rows) {
  for (const r of rows) {
    await client.query(
      `INSERT INTO sales_history (week, sku, units_sold)
       VALUES ($1,$2,$3)
       ON CONFLICT (week, sku) DO NOTHING`,
      [r.week, r.sku, r.unitsSold]
    );
  }
}

async function migrateOrders(client, lines) {
  for (const l of lines) {
    await client.query(
      `INSERT INTO orders (id, order_id, sku, sku_id, sku_name, qty, imported_at, order_date, week)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [l.id, l.orderId, l.sku, l.skuId, l.skuName, l.qty,
       l.importedAt, l.orderDate || null, l.week]
    );
  }
}

async function migratePurchaseOrders(client, pos) {
  for (const po of pos) {
    await client.query(
      `INSERT INTO purchase_orders (id, po_number, supplier, status, created_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [po.id, po.poNumber, po.supplier, po.status || 'draft', po.createdAt, po.notes || '']
    );
    const existingLines = await client.query('SELECT id FROM po_lines WHERE po_id = $1', [po.id]);
    if (existingLines.rows.length === 0) {
      for (const l of (po.lines || [])) {
        await client.query(
          `INSERT INTO po_lines (po_id, sku_id, sku, name, qty, cost_per_unit, received)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [po.id, l.skuId, l.sku, l.name, l.qty, l.costPerUnit || 0, l.received || 0]
        );
      }
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const password = req.headers['x-app-password'];
  if (password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Ping / auth check — used by the frontend login screen
  if (req.query.key === 'ping' || req.query.action === 'ping') {
    return res.status(200).json({ ok: true });
  }

  // One-time migration: reads blobs from old app_data and populates new tables
  // Safe to run multiple times — all inserts use ON CONFLICT DO NOTHING
  if (req.query.action === 'migrate') {
    const [inv, hist, pos, ord] = await Promise.all([
      legacyGet('inventory'),
      legacyGet('salesHistory'),
      legacyGet('purchaseOrders'),
      legacyGet('orders'),
    ]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (Array.isArray(inv))  await migrateInventory(client, inv);
      if (Array.isArray(hist)) await migrateSalesHistory(client, hist);
      if (Array.isArray(ord))  await migrateOrders(client, ord);
      if (Array.isArray(pos))  await migratePurchaseOrders(client, pos);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }

    return res.status(200).json({
      ok: true,
      migrated: {
        inventory:      Array.isArray(inv)  ? inv.length  : 0,
        salesHistory:   Array.isArray(hist) ? hist.length : 0,
        orders:         Array.isArray(ord)  ? ord.length  : 0,
        purchaseOrders: Array.isArray(pos)  ? pos.length  : 0,
      }
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
