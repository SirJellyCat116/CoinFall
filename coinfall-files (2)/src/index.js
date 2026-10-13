// Cloudflare entry point: serves the site from /public and sends every /ws connection
// to one Durable Object ("main") that runs all the games and keeps the database.
import { DurableObject } from 'cloudflare:workers';
import { CasinoCore } from './casino.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const stub = env.CASINO.get(env.CASINO.idFromName('main'));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class Casino extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new CasinoCore(ctx.storage.sql, { log: e => console.error(e) });
  }

  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const sock = { send: s => server.send(s), close: () => { try { server.close(1000, 'bye'); } catch { } } };
    this.core.open(sock);
    server.addEventListener('message', ev => {
      if (typeof ev.data === 'string') this.core.message(sock, ev.data);
    });
    server.addEventListener('close', () => {
      this.core.close(sock);
      try { server.close(1000, 'bye'); } catch { }
    });
    server.addEventListener('error', () => this.core.close(sock));
    return new Response(null, { status: 101, webSocket: client });
  }
}
