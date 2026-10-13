// Coinfall on Cloudflare. Pages come from the public folder; the game runs in one Durable Object
// called "Casino" that keeps every player, bet and table, and talks to browsers over a WebSocket at /ws.
import { DurableObject } from 'cloudflare:workers';
import { CasinoCore } from './casino.js';

export class Casino extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new CasinoCore(ctx.storage.sql, { log: e => console.error(e) });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.core.open(server);
    server.addEventListener('message', e => this.core.message(server, typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data)));
    const bye = () => this.core.close(server);
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') return env.CASINO.get(env.CASINO.idFromName('main')).fetch(request);
    return env.ASSETS.fetch(request);
  },
};
