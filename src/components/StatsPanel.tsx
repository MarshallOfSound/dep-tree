import type { DepGraph } from '../../shared/types';
import type { Analysis, NodeStats } from '../lib/analyzer';

interface Props {
  graph: DepGraph;
  analysis: Analysis;
  removed: Set<string>;
  reachable: Set<string>;
  simCount: number;
  hovering: boolean;
  elapsed: number;
  impactList: Array<[string, NodeStats]>;
  onToggle: (id: string) => void;
  onReset: () => void;
}

export default function StatsPanel(props: Props) {
  const {
    graph,
    analysis,
    removed,
    reachable,
    simCount,
    hovering,
    elapsed,
    impactList,
    onToggle,
    onReset,
  } = props;
  const saved = analysis.total - simCount;
  const pct = analysis.total ? Math.round((saved / analysis.total) * 100) : 0;

  return (
    <aside className="stats">
      <div className="stat-card primary">
        <div className="stat-label">{graph.root}</div>
        <div className="stat-big">
          {analysis.total}
          <span className="stat-unit">packages</span>
        </div>
        <div className="stat-meta">resolved in {elapsed}ms</div>
        {graph.truncated && <div className="stat-warn">⚠ graph truncated at 2000 nodes</div>}
      </div>

      <div className={`stat-card sim ${hovering ? 'preview' : ''}`}>
        <div className="stat-label">
          simulation {hovering && <span className="live">· hover preview</span>}
        </div>
        <div className="stat-big">
          {simCount}
          <span className="stat-unit">remaining</span>
        </div>
        <div className="gauge">
          <div className="gauge-fill" style={{ width: `${100 - pct}%` }} />
        </div>
        <div className="stat-meta accent">
          −{saved} removed · {pct}% reduction
        </div>
        {removed.size > 0 && (
          <div className="removed-list">
            {[...removed].map((id) => (
              <button key={id} className="chip sm" onClick={() => onToggle(id)}>
                {id} ✕
              </button>
            ))}
            <button className="chip sm ghost" onClick={onReset}>
              reset
            </button>
          </div>
        )}
      </div>

      <div className="stat-card scroll">
        <div className="stat-label">highest impact targets</div>
        <ol className="impact-list">
          {impactList.map(([id, s]) => {
            const isRemoved = removed.has(id);
            const isPruned = !isRemoved && !reachable.has(id);
            return (
              <li key={id}>
                <button
                  className={`impact-row ${isRemoved ? 'struck' : isPruned ? 'pruned' : ''}`}
                  onClick={() => onToggle(id)}
                  disabled={isPruned}
                  title={isPruned ? 'Already eliminated by a removed ancestor' : undefined}
                >
                  <span className="impact-name">{id}</span>
                  {isPruned && <span className="pruned-tag">pruned</span>}
                  <span className="impact-val">−{s.removalImpact}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="legend">
        <div>
          <b>unique</b> — transitive deps only this node brings in
        </div>
        <div>
          <b>shared</b> — transitive deps also required elsewhere
        </div>
        <div>
          <b>impact</b> — total packages eliminated if removed
        </div>
      </div>
    </aside>
  );
}
