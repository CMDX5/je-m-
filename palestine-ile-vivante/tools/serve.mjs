// Petit serveur statique sans dépendance : `npm start` puis http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const fichier = normalize(join(racine, chemin === '/' ? 'index.html' : chemin));
  if (!fichier.startsWith(racine)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(fichier);
    res.writeHead(200, { 'Content-Type': types[extname(fichier)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Introuvable');
  }
}).listen(port, () => console.log(`Île Vivante : http://localhost:${port}`));
