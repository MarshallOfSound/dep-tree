# dep-tree

Visualize an npm package's full transitive dependency graph and simulate what happens when you remove nodes. Built to answer: *which dependencies, if dropped, would eliminate the most transitive packages?*

## What it shows

For every node in the tree:

| metric | meaning |
|---|---|
| **impact** | total packages eliminated from the graph if this node is removed (heat-colored) |
| **unique** | transitive deps reachable *only* through this node |
| **shared** | transitive deps also reachable via other paths |
| **refs** | how many other packages depend on this one |

Click the ✕ on any row (or any entry in the "highest impact" list) to simulate removing it. The sidebar shows the new package count and % reduction. Hover a row to preview its removal without committing.

## Architecture

- **Cloudflare Worker** (`worker/`) — serves the static frontend and exposes `GET /api/resolve?name=<pkg>&version=<range>`. Resolves the dependency graph by hitting the npm registry with the abbreviated-metadata accept header, resolving semver ranges, and walking transitively. Registry responses are cached at the edge via the Cache API.
- **React frontend** (`src/`) — receives the flat graph, computes reachability-based stats client-side (`src/lib/analyzer.ts`), renders an expandable tree.

## Development

```sh
npm install
npm run preview    # build frontend + run worker locally on :8787
```

For live frontend reload against a running worker:

```sh
npm run dev:worker   # terminal 1 — worker on :8787
npm run dev          # terminal 2 — vite on :5173, proxies /api to :8787
```

## Deploy

```sh
npm run deploy
```

Requires `wrangler login` first.
