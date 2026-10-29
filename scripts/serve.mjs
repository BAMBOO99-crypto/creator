import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/core.mjs', ['core.mjs', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/pack-studio.html', ['pack-studio.html', 'text/html; charset=utf-8']],
  ['/pack-studio.mjs', ['pack-studio.mjs', 'text/javascript; charset=utf-8']],
  ['/pack-studio.css', ['pack-studio.css', 'text/css; charset=utf-8']],
  ['/pack-core.mjs', ['pack-core.mjs', 'text/javascript; charset=utf-8']],
]);

export const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";

function safePath(requestTarget) {
  if (typeof requestTarget !== 'string' || !requestTarget.startsWith('/')) return null;
  let pathname = requestTarget.split(/[?#]/, 1)[0];
  // Check the raw path before any URL parser can collapse traversal segments.
  for (let round = 0; round < 4; round += 1) {
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part === '.' || part === '..')) return null;
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return null; }
    if (decoded === pathname) return pathname;
    pathname = decoded;
  }
  return null;
}

export function createStaticServer() {
  return createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', contentSecurityPolicy);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');

    const finish = (status, message) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      finish(405, 'Only GET and HEAD are supported.');
      return;
    }
    const pathname = safePath(request.url);
    if (pathname === null) { finish(400, 'Invalid path.'); return; }
    const asset = assets.get(pathname);
    if (!asset) { finish(404, 'Not found.'); return; }
    try {
      // Only these named public assets can be served; no filesystem path comes
      // from the request. Backups, tests, docs, secrets, and .git stay private.
      const body = await readFile(resolve(root, asset[0]));
      response.statusCode = 200;
      response.setHeader('Content-Type', asset[1]);
      response.setHeader('Content-Length', body.length);
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      finish(error?.code === 'ENOENT' ? 404 : 500, error?.code === 'ENOENT' ? 'Not found.' : 'Unable to read asset.');
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const requestedPort = process.argv[2] ?? process.env.PORT ?? '8080';
  if (!/^\d+$/.test(requestedPort) || Number(requestedPort) < 1 || Number(requestedPort) > 65535) {
    console.error('Choose a port between 1 and 65535. Example: node scripts/serve.mjs 8080');
    process.exitCode = 1;
  } else {
    const server = createStaticServer();
    server.on('error', error => {
      console.error(`Could not start the local server: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(Number(requestedPort), '127.0.0.1', () => {
      console.log(`AI Command Center is ready at http://127.0.0.1:${requestedPort}`);
    });
  }
}
