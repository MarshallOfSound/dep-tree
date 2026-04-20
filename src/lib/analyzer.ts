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

export function topImpact(analysis: Analysis, rootId: string, n: number): Array<[string, NodeStats]> {
  return [...analysis.stats.entries()]
    .filter(([id]) => id !== rootId)
    .sort((a, b) => b[1].removalImpact - a[1].removalImpact)
    .slice(0, n);
}
