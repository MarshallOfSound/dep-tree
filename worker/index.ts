import { Hono } from 'hono';
import { resolve } from './resolver';
import type { ResolveResponse } from '../shared/types';

type Bindings = { ASSETS: Fetcher };

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/resolve', async (c) => {
  const name = c.req.query('name');
  const version = c.req.query('version') || 'latest';
  const asOfRaw = c.req.query('asOf');
  if (!name) return c.json({ error: 'missing name' }, 400);

  let asOf: number | null = null;
  if (asOfRaw) {
    const t = Date.parse(asOfRaw);
    if (Number.isNaN(t)) return c.json({ error: 'invalid asOf date' }, 400);
    asOf = t;
  }

  const cache = (globalThis as { caches?: CacheStorage }).caches?.default as Cache | undefined;
  const t0 = Date.now();
  try {
    const graph = await resolve(name, version, cache, asOf);
    const body: ResolveResponse = { graph, elapsedMs: Date.now() - t0, asOf: asOfRaw || undefined };
    return c.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
