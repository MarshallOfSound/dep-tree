export interface DepNode {
  name: string;
  version: string;
  dependencies: string[];
}

export interface DepGraph {
  root: string;
  nodes: Record<string, DepNode>;
  truncated?: boolean;
}

export interface ResolveResponse {
  graph: DepGraph;
  elapsedMs: number;
  asOf?: string;
}
