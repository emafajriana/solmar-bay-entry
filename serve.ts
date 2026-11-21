// SOLMAR BAY — a pocket static server for playing the game locally.
//
//   node serve.ts [port]
//
// Serves this repository over http://localhost so the game's ES modules
// and import map load the way a browser demands (file:// will not do).
// Development convenience only: the entry itself is the static game/
// folder, hostable anywhere as-is. No dependencies, no build step.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.argv[2] ?? 8137);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let path = normalize(decodeURIComponent(url.pathname));
    if (path === "/" || path === "\\") path = "/game/index.html";
    if (path.includes("..")) throw new Error("no traversal");
    const file = join(root, path);
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found\n");
  }
});

server.listen(port, () => {
  console.log(`solmar-bay: playing at http://localhost:${port}/`);
});
