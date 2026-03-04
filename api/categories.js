import { pool, checkAuth, parseBody, initTables } from './_db.js';

async function getAll(client) {
  const r = await client.query(`
    SELECT c.id, c.name, COUNT(i.id)::int AS item_count
    FROM categories c
    LEFT JOIN inventory i ON i.category = c.name
    GROUP BY c.id, c.name
    ORDER BY c.name
  `);
  return r.rows.map(row => ({ id: row.id, name: row.name, itemCount: row.item_count }));
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  const client = await pool.connect();
  try {
    await initTables();

    // GET — all categories with SKU counts
    if (req.method === 'GET') {
      return res.status(200).json(await getAll(client));
    }

    // POST — create a new category { name }
    if (req.method === 'POST') {
      const { name } = await parseBody(req);
      if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
      await client.query(
        'INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING',
        [name.trim()]
      );
      return res.status(200).json(await getAll(client));
    }

    // PATCH — rename a category (?id=xxx) { name }
    // Also updates all inventory rows that use the old name
    if (req.method === 'PATCH') {
      const { id } = req.query;
      const { name } = await parseBody(req);
      if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

      const existing = await client.query('SELECT name FROM categories WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
      const oldName = existing.rows[0].name;
      if (oldName === 'Uncategorized') return res.status(400).json({ error: 'Cannot rename Uncategorized' });

      await client.query('BEGIN');
      await client.query('UPDATE inventory SET category = $1 WHERE category = $2', [name.trim(), oldName]);
      await client.query('UPDATE categories SET name = $1 WHERE id = $2', [name.trim(), id]);
      await client.query('COMMIT');
      return res.status(200).json(await getAll(client));
    }

    // DELETE — remove a category (?id=xxx)
    // Reassigns all its inventory items to Uncategorized first
    if (req.method === 'DELETE') {
      const { id } = req.query;

      const existing = await client.query('SELECT name FROM categories WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
      const catName = existing.rows[0].name;
      if (catName === 'Uncategorized') return res.status(400).json({ error: 'Cannot delete Uncategorized' });

      await client.query('BEGIN');
      await client.query("UPDATE inventory SET category = 'Uncategorized' WHERE category = $1", [catName]);
      await client.query('DELETE FROM categories WHERE id = $1', [id]);
      await client.query('COMMIT');
      return res.status(200).json(await getAll(client));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('categories error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
