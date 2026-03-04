import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function checkAuth(req, res) {
  if (req.headers['x-app-password'] !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export async function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

export async function initTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory (
      id            TEXT PRIMARY KEY,
      sku           TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'Uncategorized',
      current_stock INTEGER NOT NULL DEFAULT 0,
      reorder_point INTEGER NOT NULL DEFAULT 0,
      reorder_qty   INTEGER NOT NULL DEFAULT 0,
      avg_cost      NUMERIC(10,4) NOT NULL DEFAULT 0,
      updated_at    TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales_history (
      id         SERIAL PRIMARY KEY,
      week       DATE NOT NULL,
      sku        TEXT NOT NULL,
      units_sold INTEGER NOT NULL DEFAULT 0,
      UNIQUE(week, sku)
    );
    CREATE INDEX IF NOT EXISTS idx_sh_sku  ON sales_history(sku);
    CREATE INDEX IF NOT EXISTS idx_sh_week ON sales_history(week);

    CREATE TABLE IF NOT EXISTS orders (
      id          TEXT PRIMARY KEY,
      order_id    TEXT NOT NULL,
      sku         TEXT NOT NULL,
      sku_id      TEXT NOT NULL,
      sku_name    TEXT NOT NULL,
      qty         INTEGER NOT NULL,
      imported_at TEXT NOT NULL,
      order_date  DATE,
      week        DATE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
    CREATE INDEX IF NOT EXISTS idx_orders_sku      ON orders(sku);
    CREATE INDEX IF NOT EXISTS idx_orders_week     ON orders(week);

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id         TEXT PRIMARY KEY,
      po_number  TEXT UNIQUE NOT NULL,
      supplier   TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'draft',
      created_at DATE NOT NULL,
      notes      TEXT DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS po_lines (
      id            SERIAL PRIMARY KEY,
      po_id         TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      sku_id        TEXT NOT NULL,
      sku           TEXT NOT NULL,
      name          TEXT NOT NULL,
      qty           INTEGER NOT NULL,
      cost_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,
      received      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_pol_po_id ON po_lines(po_id);

    CREATE TABLE IF NOT EXISTS categories (
      id   SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    -- Always ensure the fallback category exists
    INSERT INTO categories (name) VALUES ('Uncategorized') ON CONFLICT DO NOTHING;

    -- Seed any category names already present on inventory rows
    INSERT INTO categories (name)
      SELECT DISTINCT category FROM inventory
      WHERE category IS NOT NULL AND category <> ''
    ON CONFLICT DO NOTHING;
  `);
}
