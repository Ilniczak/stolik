// Lokalny serwer deweloperski: serwuje stronę i obsługuje POST /api/propozycje.
// Bez DATABASE_URL zapisuje propozycje do .dev/propozycje.json, z nim wysyła je do Neon
// przez tę samą funkcję, która działa na Vercelu.
//
//   npm run dev            -> http://localhost:8765
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler, MAX_BODY_BYTES } from "../api/_lib/propozycja.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 8765;
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
};
// Tego nie serwujemy jako plików statycznych (tak jak na Vercelu).
const PRIVATE = /^\/(\.|api\/|db\/|scripts\/|node_modules\/|package)/;

const DEV_FILE = path.join(ROOT, ".dev", "propozycje.json");
async function saveToFile(data) {
  await mkdir(path.dirname(DEV_FILE), { recursive: true });
  let list = [];
  try { list = JSON.parse(await readFile(DEV_FILE, "utf8")); } catch {}
  list.push({ id: list.length + 1, created_at: new Date().toISOString(), status: "nowa", ...data });
  await writeFile(DEV_FILE, JSON.stringify(list, null, 2) + "\n");
}

const POST = process.env.DATABASE_URL
  ? (await import("../api/propozycje.js")).POST
  : createHandler(saveToFile);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST", "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Metoda niedozwolona." }));
  }
  let body;
  try { body = await readBody(req); } catch (e) {
    res.writeHead(e.status || 400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Zgłoszenie jest za duże." }));
  }
  const request = new Request(url, { method: "POST", headers: req.headers, body });
  const response = await POST(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handleStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT + path.sep) || PRIVATE.test(pathname)) {
    res.writeHead(404); return res.end("Not found");
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nie znaleziono");
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const task = url.pathname === "/api/propozycje" ? handleApi(req, res, url) : handleStatic(req, res, url);
  task.catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => {
  console.log(`stolik: http://localhost:${PORT}`);
  console.log(process.env.DATABASE_URL ? "Propozycje -> Neon (DATABASE_URL)" : `Propozycje -> ${path.relative(ROOT, DEV_FILE)}`);
});
