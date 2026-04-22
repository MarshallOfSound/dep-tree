import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DepGraph } from '../../shared/types';
import type { Analysis } from '../lib/analyzer';

type SortKey = 'impact' | 'unique' | 'shared' | 'refs';
type SortState = { key: SortKey; dir: 1 | -1 } | null;

interface Props {
  graph: DepGraph;
  analysis: Analysis;
  removed: Set<string>;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
}

interface TreeNode {
  key: string;
  id: string;
  depth: number;
  isDup: boolean;
  isCycle: boolean;
  children: TreeNode[];
}

interface BuiltTree {
  root: TreeNode;
  primary: Map<string, string>;
  parents: Map<string, string>;
}

function buildTree(graph: DepGraph): BuiltTree {
  const seen = new Set<string>();
  const primary = new Map<string, string>();
  const parents = new Map<string, string>();

  const walk = (id: string, depth: number, path: Set<string>, parentKey: string): TreeNode => {
    const key = parentKey ? `${parentKey}/${id}` : id;
    if (parentKey) parents.set(key, parentKey);
    const isCycle = path.has(id);
    const isDup = !isCycle && seen.has(id);
    if (!isCycle && !isDup) {
      seen.add(id);
      primary.set(id, key);
    }
    const deps = graph.nodes[id]?.dependencies ?? [];
    const children: TreeNode[] = [];
    if (!isDup && !isCycle && deps.length) {
      const nextPath = new Set(path).add(id);
      for (const dep of deps) children.push(walk(dep, depth + 1, nextPath, key));
    }
    return { key, id, depth, isDup, isCycle, children };
  };

  return { root: walk(graph.root, 0, new Set(), ''), primary, parents };
}

function heat(impact: number, max: number): string {
  if (max <= 1) return 'var(--muted)';
  const t = Math.min(1, Math.log1p(impact) / Math.log1p(max));
  const hue = 170 - t * 170;
  return `hsl(${hue} 90% 60%)`;
}

function metricValue(analysis: Analysis, id: string, key: SortKey): number {
  if (key === 'refs') return analysis.inboundCount.get(id) ?? 0;
  const s = analysis.stats.get(id);
  if (!s) return 0;
  if (key === 'impact') return s.removalImpact;
  if (key === 'unique') return s.unique;
  return s.shared;
}

interface RowProps {
  node: TreeNode;
  graph: DepGraph;
  analysis: Analysis;
  removed: Set<string>;
  maxImpact: number;
  sort: SortState;
  expanded: Set<string>;
  flash: string | null;
  onExpand: (key: string, open: boolean) => void;
  onJump: (id: string) => void;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
}

const Row = memo(function Row(props: RowProps) {
  const {
    node,
    graph,
    analysis,
    removed,
    maxImpact,
    sort,
    expanded,
    flash,
    onExpand,
    onJump,
    onToggle,
    onHover,
  } = props;
  const { key, id, depth, isDup, isCycle, children } = node;
  const pkg = graph.nodes[id];
  const stats = analysis.stats.get(id);
  const isRoot = id === graph.root;
  const isRemoved = removed.has(id);
  const canExpand = children.length > 0;
  const open = expanded.has(key);

  const sortedChildren = useMemo(() => {
    if (!sort) return children;
    return [...children].sort(
      (a, b) =>
        sort.dir * (metricValue(analysis, b.id, sort.key) - metricValue(analysis, a.id, sort.key)),
    );
  }, [children, sort, analysis]);

  return (
    <div
      className={`row ${isRemoved ? 'removed' : ''} ${flash === key ? 'flash' : ''}`}
      style={{ '--depth': depth } as never}
      data-key={key}
    >
      <div
        className="row-line"
        onMouseEnter={() => !isRoot && onHover(id)}
        onMouseLeave={() => onHover(null)}
      >
        <button
          className={`twist ${canExpand ? '' : 'leaf'}`}
          onClick={() => canExpand && onExpand(key, !open)}
          aria-label={open ? 'collapse' : 'expand'}
        >
          {canExpand ? (open ? '▾' : '▸') : '·'}
        </button>

        <span className="pkg-name">
          <span className="name" title={id}>
            {pkg?.name ?? id}
          </span>
          <span className="ver">@{pkg?.version}</span>
          {isDup && (
            <button className="tag dup" onClick={() => onJump(id)} title="Jump to primary occurrence">
              dedup ↗
            </button>
          )}
          {isCycle && <span className="tag cycle">cycle</span>}
        </span>

        {stats && (
          <>
            <span
              className="metric impact"
              style={{ color: heat(stats.removalImpact, maxImpact) }}
              title="Packages removed from graph if this node is removed"
            >
              −{stats.removalImpact}
            </span>
            <span className="metric" title="Transitive deps only reachable via this node">
              <b>{stats.unique}</b> <i>uniq</i>
            </span>
            <span className="metric shared" title="Transitive deps also reachable via other paths">
              <b>{stats.shared}</b> <i>shared</i>
            </span>
            <span className="metric refs" title="Number of packages that depend on this">
              {(analysis.inboundCount.get(id) ?? 0) > 1 ? `×${analysis.inboundCount.get(id)}` : ''}
            </span>
          </>
        )}

        {!isRoot ? (
          <button
            className={`rm ${isRemoved ? 'on' : ''}`}
            onClick={() => onToggle(id)}
            title={isRemoved ? 'Restore' : 'Simulate removal'}
          >
            {isRemoved ? '↺' : '✕'}
          </button>
        ) : (
          <span className="rm-spacer" />
        )}
      </div>

      {canExpand && open && !isRemoved && (
        <div className="children">
          {sortedChildren.map((child) => (
            <Row
              key={child.key}
              node={child}
              graph={graph}
              analysis={analysis}
              removed={removed}
              maxImpact={maxImpact}
              sort={sort}
              expanded={expanded}
              flash={flash}
              onExpand={onExpand}
              onJump={onJump}
              onToggle={onToggle}
              onHover={onHover}
            />
          ))}
        </div>
      )}
    </div>
  );
});

const SORT_KEYS: SortKey[] = ['impact', 'unique', 'shared', 'refs'];

export interface TreeViewHandle {
  jumpTo: (id: string) => void;
}

const TreeView = forwardRef<TreeViewHandle, Props>(function TreeView(
  { graph, analysis, removed, onToggle, onHover },
  ref,
) {
  const built = useMemo(() => buildTree(graph), [graph]);
  const [sort, setSort] = useState<SortState>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([built.root.key]));
  const [flash, setFlash] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setExpanded(new Set([built.root.key]));
    setFlash(null);
  }, [built]);

  const maxImpact = useMemo(() => {
    let m = 1;
    for (const [id, s] of analysis.stats) {
      if (id !== graph.root && s.removalImpact > m) m = s.removalImpact;
    }
    return m;
  }, [analysis, graph.root]);

  const cycleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 1 };
      if (prev.dir === 1) return { key, dir: -1 };
      return null;
    });
  }, []);

  const onExpand = useCallback((key: string, open: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const onJump = useCallback(
    (id: string) => {
      const target = built.primary.get(id);
      if (!target) return;
      setExpanded((prev) => {
        const next = new Set(prev);
        let k: string | undefined = target;
        while (k) {
          k = built.parents.get(k);
          if (k) next.add(k);
        }
        return next;
      });
      setFlash(target);
    },
    [built],
  );

  useImperativeHandle(ref, () => ({ jumpTo: onJump }), [onJump]);

  useLayoutEffect(() => {
    if (!flash) return;
    const el = bodyRef.current?.querySelector(`[data-key="${CSS.escape(flash)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const sortIndicator = (key: SortKey) => (sort?.key !== key ? '' : sort.dir === 1 ? ' ↓' : ' ↑');

  return (
    <section className="tree">
      <div className="tree-header">
        <span>package</span>
        <span className="spacer" />
        {SORT_KEYS.map((key) => (
          <button
            key={key}
            className={`col sortable ${key === 'refs' ? 'refs-col' : ''} ${sort?.key === key ? 'active' : ''}`}
            onClick={() => cycleSort(key)}
            title="Click to sort: desc → asc → off"
          >
            {key}
            {sortIndicator(key)}
          </button>
        ))}
        <span className="col rm-col" />
      </div>
      <div className="tree-body" ref={bodyRef}>
        <Row
          node={built.root}
          graph={graph}
          analysis={analysis}
          removed={removed}
          maxImpact={maxImpact}
          sort={sort}
          expanded={expanded}
          flash={flash}
          onExpand={onExpand}
          onJump={onJump}
          onToggle={onToggle}
          onHover={onHover}
        />
      </div>
    </section>
  );
});

export default TreeView;
