// Run Coinfall on plain Node.js (22 or newer), with no installs:  node dev/server.mjs
// Good for trying it on your own computer or hosting it on any Node server.
// Saves everything to coinfall.db (set DB_FILE to change it) and listens on PORT (default 8787).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CasinoCore } from '../src/casino.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 8787);
const db = new DatabaseSync(process.env.DB_FILE || 'coinfall.db');

// Same shape as Cloudflare's ctx.storage.sql
const core_opts = { log: e => console.error(e), timeScale: Number(process.env.TIME_SCALE) || 1 };
const sql = {
  exec(q, ...params) {
    const st = db.prepare(q);
    const rows = /^\s*(SELECT|WITH)\b|\bRETURNING\b/i.test(q) ? st.all(...params) : (st.run(...params), []);
    return { toArray: () => rows };
  },
};
const core = new CasinoCore(sql, core_opts);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.resolve(ROOT, '.' + p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

function frame(socket, data, op) {
  if (socket.destroyed) return;
  const n = data.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  socket.write(Buffer.concat([head, data]));
}

server.on('upgrade', (req, socket) => {
  if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const sock = { send: s => frame(socket, Buffer.from(s), 0x1), close: () => socket.end() };
  core.open(sock);
  let buf = Buffer.alloc(0), parts = [];
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskAt = off;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = Buffer.from(buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= buf[maskAt + (i & 3)];
      buf = buf.subarray(off + len);
      if (op === 0x8) { frame(socket, Buffer.alloc(0), 0x8); socket.end(); return; }
      if (op === 0x9) { frame(socket, payload, 0xA); continue; }
      if (op === 0xA) continue;
      parts.push(payload);
      if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; core.message(sock, text); }
    }
  });
  const done = () => core.close(sock);
  socket.on('close', done);
  socket.on('error', done);
});

server.listen(PORT, () => console.log(`Coinfall is running at http://localhost:${PORT}`));
