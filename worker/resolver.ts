import semver from 'semver';
import type { DepGraph, DepNode } from '../shared/types';

const REGISTRY = 'https://registry.npmjs.org';
const MAX_NODES = 2000;
const CONCURRENCY = 24;

interface Packument {
  name: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, { name: string; version: string; dependencies?: Record<string, string> }>;
}

interface Ctx {
  nodes: Map<string, DepNode>;
  packumentCache: Map<string, Promise<Packument>>;
  inFlight: Map<string, Promise<void>>;
  cfCache: Cache | undefined;
  truncated: boolean;
}

async function fetchPackument(ctx: Ctx, name: string): Promise<Packument> {
  const cached = ctx.packumentCache.get(name);
  if (cached) return cached;

  const p = (async () => {
    const url = `${REGISTRY}/${encodeURIComponent(name).replace('%40', '@').replace('%2F', '/')}`;
    const req = new Request(url, {
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
    });

    let res: Response | undefined;
    if (ctx.cfCache) res = await ctx.cfCache.match(req);
    if (!res) {
      res = await fetch(req);
      if (res.ok && ctx.cfCache) {
        const toCache = new Response(res.clone().body, res);
        toCache.headers.set('Cache-Control', 'public, max-age=300');
        ctx.cfCache.put(req, toCache).catch(() => {});
      }
    }
    if (!res.ok) throw new Error(`registry ${res.status} for ${name}`);
    return (await res.json()) as Packument;
  })();

  ctx.packumentCache.set(name, p);
  return p;
}

function resolveVersion(packument: Packument, range: string): string | null {
  const distTag = packument['dist-tags']?.[range];
  if (distTag) return distTag;

  const clean = range.replace(/^npm:.*@/, '');
  const versions = Object.keys(packument.versions);
  return semver.maxSatisfying(versions, clean, { includePrerelease: false, loose: true });
}

async function resolveNode(ctx: Ctx, name: string, range: string): Promise<string | null> {
  if (ctx.nodes.size >= MAX_NODES) {
    ctx.truncated = true;
    return null;
  }

  let packument: Packument;
  try {
    packument = await fetchPackument(ctx, name);
  } catch {
    return null;
  }

  const version = resolveVersion(packument, range) ?? packument['dist-tags']?.latest;
  if (!version) return null;

  const id = `${name}@${version}`;
  if (ctx.nodes.has(id)) return id;

  const existing = ctx.inFlight.get(id);
  if (existing) {
    await existing;
    return id;
  }

  const manifest = packument.versions[version];
  const deps = manifest?.dependencies ?? {};
  const node: DepNode = { name, version, dependencies: [] };
  ctx.nodes.set(id, node);

  const entries = Object.entries(deps);
  const work = (async () => {
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(([depName, depRange]) => resolveNode(ctx, depName, depRange)),
      );
      for (const childId of results) {
        if (childId && !node.dependencies.includes(childId)) node.dependencies.push(childId);
      }
    }
  })();

  ctx.inFlight.set(id, work);
  await work;
  ctx.inFlight.delete(id);
  return id;
}

export async function resolve(
  name: string,
  range: string,
  cfCache: Cache | undefined,
): Promise<DepGraph> {
  const ctx: Ctx = {
    nodes: new Map(),
    packumentCache: new Map(),
    inFlight: new Map(),
    cfCache,
    truncated: false,
  };

  const rootId = await resolveNode(ctx, name, range);
  if (!rootId) throw new Error(`Could not resolve ${name}@${range}`);

  return {
    root: rootId,
    nodes: Object.fromEntries(ctx.nodes),
    truncated: ctx.truncated,
  };
}
