// SOLMAR BAY — a tiny local server for playing the game during development.
//
//   node serve.ts [port]
//
// Serves the game/ folder at http://127.0.0.1:8077/ (or the port you pass).
// Standard library only, no build step. The game itself is plain static
// files; this exists so pointer lock and ES modules behave exactly the way
// they do when the folder is hosted anywhere else.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const gameDir = join(dirname(fileURLToPath(import.meta.url)), "game");
const port = Number(process.argv[2] ?? 8077);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
    const file = join(gameDir, rel === "" ? "index.html" : rel);
    if (!file.startsWith(gameDir)) throw new Error("outside game/");
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found\n");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`solmar-bay: playing at http://127.0.0.1:${port}/`);
});
