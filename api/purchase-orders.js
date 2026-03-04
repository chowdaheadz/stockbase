import { pool, checkAuth, parseBody, initTables } from './_db.js';

async function getAllPOs(client) {
  const pos   = await client.query('SELECT * FROM purchase_orders ORDER BY created_at DESC, id');
  const lines = await client.query('SELECT * FROM po_lines ORDER BY po_id, id');

  const linesByPO = {};
  for (const l of lines.rows) {
    if (!linesByPO[l.po_id]) linesByPO[l.po_id] = [];
    linesByPO[l.po_id].push({
      skuId:       l.sku_id,
      sku:         l.sku,
      name:        l.name,
      qty:         l.qty,
      costPerUnit: parseFloat(l.cost_per_unit),
      received:    l.received,
    });
  }

  return pos.rows.map(p => ({
    id:        p.id,
    poNumber:  p.po_number,
    supplier:  p.supplier,
    status:    p.status,
    createdAt: p.created_at instanceof Date ? p.created_at.toISOString().slice(0, 10) : p.created_at,
    notes:     p.notes,
    lines:     linesByPO[p.id] || [],
  }));
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  const client = await pool.connect();
  try {
    await initTables();

    // GET — return all POs with their line items
    if (req.method === 'GET') {
      return res.status(200).json(await getAllPOs(client));
    }

    // POST — create a new PO (body = full PO object with lines)
    if (req.method === 'POST') {
      const { id, poNumber, supplier, status, createdAt, notes, lines } = await parseBody(req);
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO purchase_orders (id, po_number, supplier, status, created_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, poNumber, supplier, status || 'draft', createdAt, notes || '']
      );
      for (const l of (lines || [])) {
        await client.query(
          `INSERT INTO po_lines (po_id, sku_id, sku, name, qty, cost_per_unit, received)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, l.skuId, l.sku, l.name, l.qty, l.costPerUnit || 0, l.received || 0]
        );
      }
      await client.query('COMMIT');
      return res.status(200).json(await getAllPOs(client));
    }

    // PATCH — update a PO by id (?id=xxx)
    // Accepts any subset of { status, supplier, notes, lines }
    // If lines is provided the old lines are replaced entirely
    if (req.method === 'PATCH') {
      const { id } = req.query;
      const body = await parseBody(req);
      await client.query('BEGIN');
      await client.query(
        `UPDATE purchase_orders SET
           status     = COALESCE($2, status),
           supplier   = COALESCE($3, supplier),
           notes      = COALESCE($4, notes),
           updated_at = NOW()
         WHERE id = $1`,
        [id, body.status ?? null, body.supplier ?? null, body.notes ?? null]
      );
      if (Array.isArray(body.lines)) {
        await client.query('DELETE FROM po_lines WHERE po_id = $1', [id]);
        for (const l of body.lines) {
          await client.query(
            `INSERT INTO po_lines (po_id, sku_id, sku, name, qty, cost_per_unit, received)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [id, l.skuId, l.sku, l.name, l.qty, l.costPerUnit || 0, l.received || 0]
          );
        }
      }
      await client.query('COMMIT');
      return res.status(200).json(await getAllPOs(client));
    }

    // DELETE — delete a PO and its lines (?id=xxx)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.query('DELETE FROM purchase_orders WHERE id = $1', [id]);
      return res.status(200).json(await getAllPOs(client));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('purchase-orders error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
