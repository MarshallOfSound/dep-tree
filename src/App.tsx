import { useCallback, useMemo, useState } from 'react';
import type { DepGraph, ResolveResponse } from '../shared/types';
import { analyze, simulateRemoval, topImpact } from './lib/analyzer';
import PackageInput from './components/PackageInput';
import TreeView from './components/TreeView';
import StatsPanel from './components/StatsPanel';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string>('');
  const [graph, setGraph] = useState<DepGraph | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);

  const analysis = useMemo(() => (graph ? analyze(graph) : null), [graph]);

  const effectiveRemoved = useMemo(() => {
    if (!hover || removed.has(hover)) return removed;
    const s = new Set(removed);
    s.add(hover);
    return s;
  }, [removed, hover]);

  const simCount = useMemo(
    () => (graph ? simulateRemoval(graph, effectiveRemoved).size : 0),
    [graph, effectiveRemoved],
  );

  const reachableAfterRemoval = useMemo(
    () => (graph ? simulateRemoval(graph, removed) : new Set<string>()),
    [graph, removed],
  );

  const load = useCallback(async (name: string, version: string) => {
    setStatus('loading');
    setError('');
    setGraph(null);
    setRemoved(new Set());
    setHover(null);
    try {
      const q = new URLSearchParams({ name, version: version || 'latest' });
      const res = await fetch(`/api/resolve?${q}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ResolveResponse;
      setGraph(data.graph);
      setElapsed(data.elapsedMs);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  const toggleRemoved = useCallback((id: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const impactList = useMemo(
    () => (analysis && graph ? topImpact(analysis, graph.root, 25) : []),
    [analysis, graph],
  );

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <h1>dep-tree</h1>
          <span className="brand-sub">npm dependency analyzer</span>
        </div>
        <PackageInput onSubmit={load} loading={status === 'loading'} />
      </header>

      {status === 'idle' && (
        <div className="empty">
          <div className="empty-glyph">⌬</div>
          <p>Enter a package name to map its dependency graph.</p>
          <div className="examples">
            {['express', 'vite', 'webpack', 'next', 'react-scripts'].map((p) => (
              <button key={p} className="chip" onClick={() => load(p, 'latest')}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="empty">
          <div className="spinner" />
          <p>Resolving dependency graph…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="empty error">
          <p>⚠ {error}</p>
        </div>
      )}

      {status === 'ready' && graph && analysis && (
        <div className="workspace">
          <StatsPanel
            graph={graph}
            analysis={analysis}
            removed={removed}
            reachable={reachableAfterRemoval}
            simCount={simCount}
            hovering={!!hover && !removed.has(hover)}
            elapsed={elapsed}
            impactList={impactList}
            onToggle={toggleRemoved}
            onReset={() => setRemoved(new Set())}
          />
          <TreeView
            graph={graph}
            analysis={analysis}
            removed={removed}
            onToggle={toggleRemoved}
            onHover={setHover}
          />
        </div>
      )}
    </div>
  );
}
