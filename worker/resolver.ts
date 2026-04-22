import semver from 'semver';
import type { DepGraph, DepNode } from '../shared/types';

const REGISTRY = 'https://registry.npmjs.org';
const MAX_NODES = 2000;
const CONCURRENCY = 24;

interface Packument {
  name: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, { name: string; version: string; dependencies?: Record<string, string> }>;
  time?: Record<string, string>;
}

interface Ctx {
  nodes: Map<string, DepNode>;
  packumentCache: Map<string, Promise<Packument>>;
  inFlight: Map<string, Promise<void>>;
  cfCache: Cache | undefined;
  truncated: boolean;
  asOf: number | null;
}

async function fetchPackument(ctx: Ctx, name: string): Promise<Packument> {
  const cached = ctx.packumentCache.get(name);
  if (cached) return cached;

  const p = (async () => {
    const url = `${REGISTRY}/${encodeURIComponent(name).replace('%40', '@').replace('%2F', '/')}`;
    const accept = ctx.asOf !== null ? 'application/json' : 'application/vnd.npm.install-v1+json';
    const req = new Request(url, { headers: { Accept: accept } });

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

function eligibleVersions(packument: Packument, asOf: number | null): string[] {
  const all = Object.keys(packument.versions);
  if (asOf === null) return all;
  const time = packument.time ?? {};
  return all.filter((v) => {
    const t = time[v];
    return t ? Date.parse(t) <= asOf : false;
  });
}

function resolveVersion(packument: Packument, range: string, asOf: number | null): string | null {
  const versions = eligibleVersions(packument, asOf);
  if (!versions.length) return null;

  if (asOf === null) {
    const distTag = packument['dist-tags']?.[range];
    if (distTag) return distTag;
  } else if (range === 'latest' || range === '*' || range === '') {
    const sorted = semver.rsort(versions.filter((v) => !semver.prerelease(v)));
    return sorted[0] ?? semver.rsort(versions)[0] ?? null;
  }

  const clean = range.replace(/^npm:.*@/, '');
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

  const version =
    resolveVersion(packument, range, ctx.asOf) ??
    (ctx.asOf === null ? packument['dist-tags']?.latest : null);
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
  asOf: number | null = null,
): Promise<DepGraph> {
  const ctx: Ctx = {
    nodes: new Map(),
    packumentCache: new Map(),
    inFlight: new Map(),
    cfCache,
    truncated: false,
    asOf,
  };

  const rootId = await resolveNode(ctx, name, range);
  if (!rootId) {
    if (asOf !== null) {
      const dateStr = new Date(asOf).toISOString().slice(0, 10);
      const packument = await ctx.packumentCache.get(name)?.catch(() => null);
      const tagTarget = packument?.['dist-tags']?.[range];
      if (tagTarget) {
        throw new Error(
          `Dist-tag "${range}" points to ${tagTarget} today, but npm doesn't track tag history — clear the "as of" date or use an explicit version/range`,
        );
      }
      throw new Error(
        `Impossible to compute graph on this date — no version of ${name} matching "${range}" was published on or before ${dateStr}`,
      );
    }
    throw new Error(`Could not resolve ${name}@${range}`);
  }

  return {
    root: rootId,
    nodes: Object.fromEntries(ctx.nodes),
    truncated: ctx.truncated,
  };
}
