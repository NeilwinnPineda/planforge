# Planforge

**Residential layout generator — from project brief to construction-ready output.**

Live → [neilwinnpineda.github.io/planforge](https://neilwinnpineda.github.io/planforge/)

---

## What it does

Planforge is a browser-based layout generation tool for residential design. You define a room program, configure the site, and the system runs physics-based simulations to produce verified floor plan candidates — then packages the best result as a typed contract ready to deliver to a Revit model.

The workflow runs in ten stages:

| # | Stage | What happens |
|---|---|---|
| 01 | Program Setup | Define rooms, target areas, adjacency preferences, and design rules |
| 02 | Site and Lot | Set lot segments, setbacks, RROW lines, and buildable envelope |
| 03 | Generation | Seed room positions inside the buildable bounds using tag-based bias profiles |
| 04 | Simulation | Run parallel bubble physics engines with heatmap feedback from prior successful runs |
| 05 | Processing | Transform captures through Voronoi clipping, hallway injection, and UV edge negotiation |
| 06 | Verification | Check nine layout rules: frontage, access, deficiency, aspect ratio, slivers, overlaps |
| 07 | Candidate Gallery | Compare verified layouts and shortlist the strongest candidates |
| 08 | Construction Output | Extract wall segments, door placements, and window placements |
| 09 | Output Viewer | Inspect the full typed layout contract before delivery |
| 10 | Reporting | Track pipeline reports and push history to the Revit endpoint |

## Verification

Every layout must pass nine checks before it is accepted:

1. No room below 75% of its target area
2. No cell with aspect ratio ≥ 4.5:1
3. BFS access reachability from foyer to all rooms
4. Master bed adjacent to master bath; foyer adjacent to living
5. Garage must touch the front boundary
6. Foyer must touch the front boundary
7. No non-support cell with a sliver dimension below threshold
8. No overlapping cell pairs

Layouts that fail any check are culled with reasons recorded on the artifact.

## Revit integration

Accepted layouts are exported as a typed `ConstructionContractExport` and pushed to a local Revit HTTP bridge running at `localhost:8765`. The companion Revit add-in stores contracts by layout ID and exposes them for a preview and apply workflow inside Revit 2024.

## Running locally

```bash
npm install
npm start
```

Opens at `http://localhost:4200`.

Production build:

```bash
npm run build
```

## Tech stack

- Angular 21.2 — standalone components, signals, computed()
- Physics simulation — weighted Voronoi, SAT scoring, heatmap spawn bias
- Revit bridge — .NET Framework 4.8 WPF add-in, local HTTP, ExternalEvent routing
- Deployed via GitHub Actions to GitHub Pages

## Contributors

See [CONTRIBUTORS.md](CONTRIBUTORS.md)

## License

MIT — see [LICENSE](LICENSE)
