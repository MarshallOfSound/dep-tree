import type { DepGraph } from '../../shared/types';

export interface NodeStats {
  subtreeSize: number;
  unique: number;
  shared: number;
  removalImpact: number;
}

export interface Analysis {
  total: number;
  stats: Map<string, NodeStats>;
  inboundCount: Map<string, number>;
}

function reachable(graph: DepGraph, from: string, exclude: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  if (exclude.has(from)) return seen;
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = graph.nodes[id];
    if (!node) continue;
    for (const dep of node.dependencies) {
      if (!exclude.has(dep) && !seen.has(dep)) stack.push(dep);
    }
  }
  return seen;
}

const EMPTY: ReadonlySet<string> = new Set();

export function analyze(graph: DepGraph): Analysis {
  const all = reachable(graph, graph.root, EMPTY);
  const total = all.size;

  const inboundCount = new Map<string, number>();
  for (const id of all) {
    for (const dep of graph.nodes[id]?.dependencies ?? []) {
      inboundCount.set(dep, (inboundCount.get(dep) ?? 0) + 1);
    }
  }

  const stats = new Map<string, NodeStats>();
  for (const id of all) {
    const subtree = reachable(graph, id, EMPTY);
    let removalImpact: number;
    if (id === graph.root) {
      removalImpact = total;
    } else {
      const without = reachable(graph, graph.root, new Set([id]));
      removalImpact = total - without.size;
    }
    const unique = removalImpact - 1;
    const shared = subtree.size - 1 - unique;
    stats.set(id, { subtreeSize: subtree.size, unique, shared, removalImpact });
  }

  return { total, stats, inboundCount };
}

export function simulateRemoval(graph: DepGraph, removed: ReadonlySet<string>): Set<string> {
  if (removed.has(graph.root)) return new Set();
  return reachable(graph, graph.root, removed);
}

export interface Duplicate {
  name: string;
  versions: Array<{ id: string; version: string; dependents: string[]; path: string[] }>;
}

function shortestPaths(graph: DepGraph): Map<string, string> {
  const parent = new Map<string, string>();
  const queue = [graph.root];
  const seen = new Set([graph.root]);
  while (queue.length) {
    const id = queue.shift()!;
    for (const dep of graph.nodes[id]?.dependencies ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      parent.set(dep, id);
      queue.push(dep);
    }
  }
  return parent;
}

function pathTo(parent: Map<string, string>, target: string): string[] {
  const path = [target];
  let cur = target;
  while (parent.has(cur)) {
    cur = parent.get(cur)!;
    path.push(cur);
  }
  return path.reverse();
}

export function findDuplicates(graph: DepGraph): Duplicate[] {
  const byName = new Map<string, string[]>();
  for (const [id, node] of Object.entries(graph.nodes)) {
    const list = byName.get(node.name) ?? [];
    list.push(id);
    byName.set(node.name, list);
  }

  const dependentsOf = new Map<string, string[]>();
  for (const [id, node] of Object.entries(graph.nodes)) {
    for (const dep of node.dependencies) {
      const list = dependentsOf.get(dep) ?? [];
      list.push(id);
      dependentsOf.set(dep, list);
    }
  }

  const parent = shortestPaths(graph);
  const dupNames = new Set([...byName].filter(([, ids]) => ids.length > 1).map(([n]) => n));

  const dups: Duplicate[] = [];
  for (const [name, ids] of byName) {
    if (ids.length < 2) continue;
    const versions = ids
      .map((id) => ({
        id,
        version: graph.nodes[id].version,
        dependents: dependentsOf.get(id) ?? [],
        path: pathTo(parent, id),
      }))
      .sort((a, b) => b.dependents.length - a.dependents.length);

    // A duplicate is "derived" if every version's path passes through some OTHER
    // duplicated package — i.e. it's a downstream consequence of an upstream dup.
    const derived = versions.every((v) =>
      v.path.slice(1, -1).some((mid) => {
        const midName = graph.nodes[mid]?.name;
        return midName !== name && dupNames.has(midName);
      }),
    );
    if (derived) continue;

    dups.push({ name, versions });
  }
  return dups.sort((a, b) => b.versions.length - a.versions.length || a.name.localeCompare(b.name));
}

export function topImpact(analysis: Analysis, rootId: string, n: number): Array<[string, NodeStats]> {
  return [...analysis.stats.entries()]
    .filter(([id]) => id !== rootId)
    .sort((a, b) => b[1].removalImpact - a[1].removalImpact)
    .slice(0, n);
}
