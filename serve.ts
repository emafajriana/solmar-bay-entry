// serve.ts — a small development server for SOLMAR BAY.
//
//   node serve.ts [--port 8080]
//
// It serves this entry's game/ folder on 127.0.0.1 so the game can be played
// locally in a desktop browser with no build step and no network access.
// Requests are confined to game/: a path that climbs out of it is refused.
// Node's standard library only; this is a local convenience, not a hardened
// public web server.

import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function pickPort(argv: string[]): number {
  const at = argv.indexOf('--port');
  const value = at === -1 ? 8080 : Number(argv[at + 1]);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8080;
}

const CONTENT_TYPES = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.bin', 'application/octet-stream'],
  ['.wasm', 'application/wasm'],
]);

async function handle(
  request: { url?: string; method?: string },
  response: {
    writeHead: (code: number, headers?: Record<string, string | number>) => unknown;
    end: (body?: string | Buffer) => unknown;
  },
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const target = resolve(join(gameRoot, '.' + pathname));
  if (target !== gameRoot && !target.startsWith(gameRoot + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  let body: Buffer;
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('directory');
    body = await readFile(target);
  } catch {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': CONTENT_TYPES.get(extname(target).toLowerCase()) ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

const port = pickPort(process.argv.slice(2));
createServer((request, response) => {
  void handle(request, response);
}).listen(port, '127.0.0.1', () => {
  console.log(`SOLMAR BAY dev server: http://localhost:${port}`);
});
