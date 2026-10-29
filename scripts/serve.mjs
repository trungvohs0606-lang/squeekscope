// A tiny static file server for local development. No dependencies.
//   node scripts/serve.mjs            -> http://localhost:5101
//   node scripts/serve.mjs --port 8080
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const flag = process.argv.indexOf('--port');
const port = Number(flag > -1 ? process.argv[flag + 1] : process.env.PORT || 5101);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (path === '' || path.endsWith(sep)) path = join(path, 'index.html');
    const file = resolve(root, path);
    if (file !== root && !file.startsWith(root + sep)) throw Object.assign(new Error('outside root'), { code: 'ENOENT' });
    const info = await stat(file);
    const target = info.isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
    console.log(200, req.method, url.pathname);
  } catch (err) {
    const missing = err?.code === 'ENOENT' || err?.code === 'ENOTDIR';
    res.writeHead(missing ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(missing ? 'Not found' : 'Server error');
    console.log(missing ? 404 : 500, req.method, req.url);
  }
}).listen(port, () => console.log(`Squeekscope on http://localhost:${port}`));
