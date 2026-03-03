import { Client, FileType } from 'basic-ftp';
import { Writable } from 'stream';

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await parseBody(req);
  const { action, host, port, user, password: ftpPass, path: ftpPath, filename } = body;

  if (!host) return res.status(400).json({ error: 'FTP host is required' });

  const client = new Client(15000);
  try {
    await client.access({
      host,
      port: parseInt(port) || 21,
      user: user || 'anonymous',
      password: ftpPass || '',
      secure: false,
    });

    const remotePath = ftpPath || '/';

    if (action === 'list') {
      const list = await client.list(remotePath);
      const csvFiles = list
        .filter(f => f.type === FileType.File && f.name.toLowerCase().endsWith('.csv'))
        .map(f => ({
          name: f.name,
          size: f.size,
          modifiedAt: f.modifiedAt ? f.modifiedAt.toISOString() : null,
        }));
      return res.status(200).json({ files: csvFiles });
    }

    if (action === 'fetch') {
      if (!filename) return res.status(400).json({ error: 'filename required' });
      const chunks = [];
      const writable = new Writable({
        write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
      });
      const filePath = remotePath.endsWith('/')
        ? `${remotePath}${filename}`
        : `${remotePath}/${filename}`;
      await client.downloadTo(writable, filePath);
      const content = Buffer.concat(chunks).toString('utf8');
      return res.status(200).json({ content, filename });
    }

    return res.status(400).json({ error: 'Unknown action. Use "list" or "fetch".' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    client.close();
  }
}
