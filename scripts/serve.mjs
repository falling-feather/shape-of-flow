import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {APP_FILES} from './app-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const built = process.argv.includes('--dist');
const servedRoot = built ? path.join(root, 'dist') : root;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(servedRoot, relative);
    const inRoot = file.startsWith(path.resolve(servedRoot) + path.sep);
    const allowed = !relative.includes('\\') && (APP_FILES.includes(relative) || (relative.startsWith('src/') && !relative.split('/').includes('..')));
    if (!inRoot || !allowed || !(await stat(file)).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(Number(process.env.PORT || 5197), '127.0.0.1', () => {
  console.log(`Local: http://127.0.0.1:${server.address().port}/`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
