import { useState } from 'react';
import type { DepGraph } from '../../shared/types';
import type { Analysis, Duplicate, NodeStats } from '../lib/analyzer';

interface Props {
  graph: DepGraph;
  analysis: Analysis;
  removed: Set<string>;
  reachable: Set<string>;
  simCount: number;
  hovering: boolean;
  elapsed: number;
  asOf?: string;
  impactList: Array<[string, NodeStats]>;
  duplicates: Duplicate[];
  onToggle: (id: string) => void;
  onJump: (id: string) => void;
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
    asOf,
    impactList,
    duplicates,
    onToggle,
    onJump,
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
        <div className="stat-meta">
          resolved in {elapsed}ms{asOf && <> · as of <b className="as-of-badge">{asOf}</b></>}
        </div>
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

      {duplicates.length > 0 && (
        <DuplicatesCard duplicates={duplicates} rootId={graph.root} onJump={onJump} />
      )}

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

function DuplicatesCard({
  duplicates,
  rootId,
  onJump,
}: {
  duplicates: Duplicate[];
  rootId: string;
  onJump: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAllDeps, setShowAllDeps] = useState(false);

  const toggle = (id: string) => {
    setExpanded((e) => (e === id ? null : id));
    setShowAllDeps(false);
  };

  return (
    <div className="stat-card scroll">
      <div className="stat-label">
        duplicate versions <span className="count">· {duplicates.length}</span>
      </div>
      <div className="dup-list">
        {duplicates.map((d) => (
          <div key={d.name} className="dup-row">
            <div className="dup-name">{d.name}</div>
            <div className="dup-versions">
              {d.versions.map((v) => (
                <button
                  key={v.id}
                  className={`dup-ver ${expanded === v.id ? 'active' : ''}`}
                  onClick={() => toggle(v.id)}
                  title={
                    v.dependents.length
                      ? `required by:\n${v.dependents.join('\n')}`
                      : 'root dependency'
                  }
                >
                  {v.version}
                  <i>×{v.dependents.length}</i>
                </button>
              ))}
            </div>
            {d.versions.map((v) => {
              if (expanded !== v.id) return null;
              const pathParent = v.path[v.path.length - 2];
              const others = v.dependents.filter((dep) => dep !== pathParent);
              const shown = others.length <= 4 || showAllDeps ? others : others.slice(0, 4);
              const hidden = others.length - shown.length;
              return (
                <div key={v.id} className="dup-path">
                  {v.path.map((id, i) => (
                    <button
                      key={i}
                      className={`dup-path-seg ${id === rootId ? 'root' : i === v.path.length - 1 ? 'target' : ''}`}
                      style={{ paddingLeft: `${i * 10}px` }}
                      onClick={() => onJump(id)}
                      title="Show in tree"
                    >
                      {i > 0 && <span className="dup-path-arrow">└ </span>}
                      {id}
                    </button>
                  ))}
                  {others.length > 0 && (
                    <div className="dup-path-more">
                      <div className="dup-path-more-label">also required by</div>
                      {shown.map((dep) => (
                        <button
                          key={dep}
                          className="dup-path-seg"
                          onClick={() => onJump(dep)}
                          title="Show in tree"
                        >
                          {dep}
                        </button>
                      ))}
                      {hidden > 0 && (
                        <button className="dup-path-expand" onClick={() => setShowAllDeps(true)}>
                          + {hidden} more
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
