# Rebuild Roadmap

## Purpose

This roadmap tracks the incremental rebuild of `testing/app-next`.

The rebuild target is a production-oriented procedural generation app that takes a structured design source and outputs polygonal building-layout geometry with strong reporting, inspection, and stage boundaries.

## Current Slice

### Slice 0 - Foundation Workspace

Status: Done

Scope:

- create the new Angular workspace
- establish the folder structure for shell, core, features, and shared concerns
- document the rebuild rules and terminology
- stand up a minimal shell that states the app purpose clearly
- run the first build/test validation pass

Out of scope:

- legacy feature migration
- simulation logic
- reporting endpoint integration
- polygon generation

## Planned Early Slices

### Slice 1 - Source Intake

Goal:

- load a typed design source into `app-next`
- validate source identity and top-level structure
- present source facts without bringing over generation logic

Status: Done

Delivered:

- local source artifact for `app-next`
- typed source contract
- standalone source validation step
- read-only source intake service
- source intake page for inspection of source facts and validation messages

### Slice 2 - Simulation Output Reporting Baseline

Goal:

- establish the first structured endpoint reporting contract
- log meaningful layout capture/pass events as soon as simulation-stage outputs exist

Status: Done

Delivered:

- typed pipeline report models for simulation-capture and layout-pass records
- local endpoint server for early report history
- endpoint client service for browser-side report posting and history fetch
- reporting baseline page with self-test report emission
- structured mock geometry snapshots so inspection starts before rebuilt simulation exists

### Slice 3 - First Geometry Pipeline Step

Goal:

- introduce the first canonical geometry output step with explicit input/output contracts

Status: Done

Delivered:

- canonical lot-geometry models
- deterministic lot/buildable polygon derivation from source lot segments
- separate geometry service for stage access
- derived preview page showing canonical output without mixing rendering into the stage itself

### Slice 4 - First Candidate Layout Generation

Goal:

- derive active room instances from the source program
- generate a first deterministic candidate layout artifact inside the buildable envelope

Status: Done

Delivered:

- canonical active room-instance derivation
- deterministic band-based candidate seed generation
- generation stage service for orchestration
- generation page for inspection of the first candidate layout artifact

## Backlog Scan

The old app scan shows that the next proper migration seam after Slice 4 is the simulation block, not early footprint interpretation.

Primary missing migration areas still living in `testing/app/src/app/app.ts` include:

- simulation engine lifecycle: `startBuildableSimulation`, `stopBuildableSimulation`, `shakeBuildableSimulation`, and loop timer ownership
- job loop orchestration: multi-job state, active job switching, and hard-reset capture loop control
- candidate capture gating: front-edge checks, SAT threshold checks, adaptive capture thresholds, and captured-layout insertion
- reset behavior: score-based resets, hard-interval resets, and runner reset reporting
- initial bubble placement: candidate seeding grid, frontage-biased placement, and filler seeding logic
- simulation scoring and inspection: attraction / repel SAT rows, weighted averages, and runner metrics

The earlier footprint slice was removed from the active rebuild sequence because it created intent drift and skipped unresolved simulation-stage migrations.

## Continuation Rule

Future rebuild work should also follow `docs/AI_STEP_GUIDE.md`.

That guide exists to keep slice numbering, block placement, and anti-monolith enforcement clear for any later AI or human continuation.

### Slice 5 - Simulation Engine Foundation

Goal:

- rebuild the simulation-stage lifecycle in bounded blocks
- stand up runner state ownership and timer-safe engine control
- preserve the true execution seam between candidate seeding and candidate capture
- keep reporting attached to actual simulation events instead of speculative downstream geometry

Status: Done

Delivered:

- typed simulation job models
- simulation-stage service owning job lifecycle only
- engine start/stop/reset/shake loop control with safe timer cleanup
- simulation inspection page showing job state, lifecycle metrics, and visual preview
- extracted global status and control bar in the app shell for cross-tab visibility
- auto-run startup from the app shell so the simulation engine and loop do not need manual restart on each edit

### Slice 6 - First Real Simulation Behavior

Goal:

- migrate the first actual simulation behavior block from the legacy app
- replace static seeded preview behavior with real placement and motion updates
- keep the migration bounded to simulation-stage prerequisites needed before honest capture and downstream conversion

Status: Done

Delivered:

- initial inside-envelope bubble placement using candidate rings and frontage bias
- velocity-based simulation stepping with damping and max-speed clamp
- pairwise collision push and boundary-safe integration
- adjacency-matrix attraction and repulsion force application
- filler generation seeded from the remaining buildable-area budget
- frontage-aware foyer and garage pull toward the road edge
- simulation inspection metrics for lot usage, force configuration, and room schedule
- attraction and repulsion SAT inspection summaries for the active simulation job
- live simulation preview driven by real state updates instead of static seed echoes

Checkpoint reached:

- the new app now runs real simulation state instead of static seed presentation
- the new app now presents the simulation state with enough metrics to inspect prerequisite behavior before capture migration

Still out of scope after this checkpoint:

- adaptive capture threshold stepping
- candidate pass/fail capture gating and capture insertion
- score-triggered reset behavior tied to failed capture attempts
- schematic conversion
- survivor pipeline
- downstream polygon interpretation

### Next Proper Seam

The next migration seam after this checkpoint is simulation capture and inspection completion, not footprint simplification.

That seam should focus on:

- front-edge pass/fail gating for front-facing rooms
- SAT-threshold pass/fail gating
- adaptive threshold decay and reset bookkeeping
- structured reporting from real simulation capture attempts
- completion of the simulation inspection/control surface around those behaviors

### Slice 7 - Simulation Capture Checkpoint

Goal:

- restore the simulation-stage decision seam so the loop evaluates candidates instead of only resetting them
- make pass/fail reasoning visible in the page itself
- emit structured capture reports from real simulation-stage acceptances

Status: Done

Delivered:

- front-edge pass/fail gating for front-facing rooms
- SAT-threshold pass/fail gating with weighted scoring
- threshold step-down on repeated SAT failures when score reset is enabled
- recent capture summaries kept in simulation-stage state
- typed simulation-capture report payloads emitted from accepted candidates
- visible latest-evaluation status in the simulation page so failures are inspectable
- lightweight headless runtime inspection tooling for browser-error and simulation-surface checks
- runtime inspection already proved useful by catching a real simulation-route initialization bug that build/test did not expose

Still out of scope after Slice 7:

- survivor selection
- schematic conversion
- final polygon room-cell generation

### Current Follow-Up Tuning

Recent post-checkpoint tuning on the simulation seam now includes:

- stage-safe seeding bias profiles that stay limited to currently available early-pipeline tags and bands
- simulation candidate sorting that respects explicit seed anchors and edge preference without assuming late-pipeline room intent
- clearer seed-stage inspection text so future migration work can see which bias came from current-stage data versus later-stage logic
- reset respawn randomness so unbiased jobs re-seed as genuinely fresh simulation attempts
- widened score distinction for attraction and repulsion so priority levels are visibly different in motion
- softer collision response with stronger penetration pushback and centroid-amplified congestion clearing
- room-area-weighted force response so larger rooms behave with more realistic inertia
- explicit `vista` room tagging with weak buildable-boundary attraction
- generated filler-to-generated filler adjacency now correctly resolves to the generated default score of `1`, restoring strong filler/filler repulsion instead of the weaker generic same-type fallback
- simulation lifecycle repacked into isolated engine instances behind a registry facade so later gallery work can scale beyond one active engine without re-owning timer or physics logic
- cluster-level control moved back to one global bar, while instance detail is compressed into a single in-page simulation cluster panel
- automatic instance growth now expands from the primary engine toward four instances on a 10-second cadence
- the cluster now acts as an explicit orchestrator seam:
  - one primary simulation instance
  - three hard-cascaded sibling instances for this checkpoint
  - one score-sorted cross-instance capture gallery compiled from accepted simulation outputs

### Checkpoint Rescan

Rescan result after the current simulation tuning pass:

Now clearly present in `app-next`:

- typed source intake and validation
- canonical lot and buildable geometry
- active room-instance derivation
- deterministic candidate seed generation with stage-safe seed bias
- live simulation stepping with:
  - collision separation
  - adjacency attraction / repulsion
  - frontage pull
  - filler edge pull
  - vista edge pull
  - hallway-to-sleeping special pull
  - inertia-aware force application
  - reset / shake / capture loop orchestration
- simulation capture gating with front-edge and SAT checks
- structured capture reporting and recent-capture inspection
- cross-instance orchestration with hard-cascaded instance spawning
- score-sorted capture gallery compilation across the live cluster

Still clearly legacy-only or not yet rebuilt in `app-next`:

- multi-runner simulation parity with the richer legacy runner set
- full captured-layout gallery workflow beyond the current score-sorted simulation capture list
- schematic conversion from bubble state into room cells / provisional polygons
- downstream refinement passes:
  - constrained Voronoi style partitioning
  - mass balance
  - edge stepping
  - gap absorption
  - fringe exchange
  - simplification
- verification queue, cull stages, survivor ranking, and survivor gallery
- final polygonal room output and downstream handoff contract

Checkpoint conclusion:

`app-next` is now a real simulation-and-capture checkpoint, not just a visual shell.

It is not yet a schematic, verification, survivor, or polygon-output checkpoint.

### Where We Are Now

Current rebuild status:

- the active `app-next` checkpoint is still Slice 7, the simulation capture checkpoint
- the simulation route is now suitable for force tuning, capture inspection, cluster orchestration, and early gallery compilation work
- the app can run live simulation, evaluate candidates, emit capture reports, compile score-sorted captures across the live cluster, and inspect the active instance cluster from one compressed surface
- the next proper seam is still beyond this checkpoint:
  - capture hardening and comparison ergonomics if needed
  - then fuller gallery/ranking migration
  - then schematic conversion

In plain terms:

- we are past "can it simulate"
- we are past "can it evaluate and report"
- we are not yet at "can it turn winning candidates into polygonal room layouts"

### Next Structural Move Before Processing Migration

Before large processing logic is ported from the legacy app, `app-next` now needs a processing architecture scaffold.

Why this comes first:

- the legacy processing path is real, but monolithic
- the next rebuild seam includes many actual transforms, not one step
- future work may need reordering, injection, and per-step arguments

Processing rebuild policy from the legacy scan:

- use the old code as behavior reference
- do not copy the old structural shape
- rebuild each processing step as its own service with strict input/output contracts
- run those services through one orchestrator boundary

Legacy processing sequence observed in the old app:

1. constrained Voronoi / schematic cell build
2. hallway injection
3. mass balance
4. boundary edge stepping
5. warped/intermediate diagnostic staging
6. gap absorption
7. fringe exchange
8. simplification
9. final clustered/staged output
10. verification queueing and promotion

The next migration checkpoint should therefore begin with:

- processing contracts
- processing step service boundaries
- processing orchestrator boundary
- only then actual step-by-step logic migration

### Slice 8A - Processing Handoff And Provisional Cells

Goal:

- preserve real captured layout artifacts from Layout Exploration
- create the first downstream processing artifact contracts
- rebuild the first legacy processing step as a self-contained service

Status: Done

Delivered:

- preserved captured layout artifacts in the simulation stage, not only capture summaries
- processing artifact and step contract models in `core/processing`
- processing orchestrator scaffold for ordered self-contained step execution
- first real processing step service:
  - provisional constrained cell generation from captured layout bubbles
  - explicit buildable polygon arguments
  - explicit output artifact and metrics
- dedicated Processing tab/page for inspecting:
  - selected captured layout input
  - provisional constrained cell output
  - per-step metrics and traces

Still out of scope after Slice 8A:

- hallway injection
- mass balance
- boundary edge stepping
- gap absorption
- fringe exchange
- simplification
- final clustered staging
- verification queue promotion

### Slice 8B - Hallway Injection

Goal:

- rebuild the second downstream processing step as its own bounded service
- expose a real multi-step processing chain in the Processing tab

Status: Done

Delivered:

- dedicated hallway injection step service
- typed hallway injection arguments and metrics
- processing chain in the Processing tab now runs:
  - provisional constrained cells
  - hallway injection
- the Processing tab now exposes one visible panel per declared downstream step so the migration backlog and live checkpoint can be inspected in sequence
- explicit trace note that current hallway seeding is a bounded direct-path rebuild until the legacy access-path graph is migrated

Still out of scope after Slice 8B:

- mass balance as its own dedicated step
- boundary edge stepping
- gap absorption
- fringe exchange
- simplification
- final clustered staging
- verification queue promotion

### Slice 8C - Mass Balance Renegotiation

Goal:

- rebuild the legacy area-renegotiation pass as its own dedicated downstream service
- make the Processing tab advance to a true post-hallway current output

Status: Done

Delivered:

- dedicated mass-balance renegotiation step service
- typed mass-balance arguments and metrics
- processing chain in the Processing tab now runs:
  - provisional constrained cells
  - hallway injection
  - mass balance renegotiation
- the current output paneling now advances to the mass-balanced artifact instead of stopping at hallway injection

Still out of scope after Slice 8C:

- boundary edge stepping
- warped/intermediate diagnostic staging
- gap absorption
- fringe exchange
- simplification
- final clustered staging
- verification queue promotion

### Slice 8D - Boundary Edge Stepping

Goal:

- rebuild the post-mass-balance exterior edge stepping pass as its own dedicated service
- advance the current downstream output from area rebalance to boundary-aware stepped geometry

Status: Done

Delivered:

- dedicated boundary edge stepping step service
- typed boundary edge stepping arguments and metrics
- processing chain in the Processing tab now runs:
  - provisional constrained cells
  - hallway injection
  - boundary edge stepping
  - mass balance renegotiation
- boundary edge stepping is now introduced as its own separately inspectable contained panel before mass balance
- the current output paneling remains the post-mass-balance artifact

Still out of scope after Slice 8D:

- warped site projection
- warped Voronoi rebalance
- UV Voronoi boxing
- UV edge negotiation
- residual UV absorption
- final clustered staging
- verification queue promotion

### Pipeline Correction — Post-Slice-8D Source Audit

A full source trace of `testing/app/src/app/app.ts` revealed that the step sequence documented in "Next Structural Move Before Processing Migration" was wrong.

**Boundary edge stepping** is a Panel 1 display branch in the legacy. It operates on `edgeCutVoronoiCells` which is not `p2Cells` and does not reach `finalSchematicCells` or verification. Its panel is kept as a diagnostic inspection surface and the service is preserved, but it is not a prerequisite step in the real verification-feeding chain.

**Gap absorption, fringe exchange, and simplification** are display-only diagnostic panels in the legacy with no downstream consumers. The three services currently in app-next were implemented by Codex from an earlier, easier prototype — not from `testing/app/src/app/app.ts`. Per the migration source rule, those implementations are incorrect. They are now held as typed deferred stubs only and explicitly removed from the active verification-feeding chain.

**The real verification-feeding pipeline after mass balance** is the warped grid chain: UV site projection → warped Voronoi rebalance → UV boxing → UV edge negotiation → residual absorption → final staging → verification. This was the most effective pipeline in the legacy but was not migrated. Slices 9A–9E target this chain.

**Correct real pipeline order** (feeds verification):
1. Provisional constrained cells
2. Hallway injection
3. Warped diagnostic staging
4. Mass balance renegotiation
5. Warped site projection (9A)
6. Warped Voronoi rebalance (9B)
7. UV Voronoi boxing (9C)
8. UV edge negotiation (9D)
9. Residual UV absorption (9E)
10. Final staging → verification

### Deferred Future Features

These steps are declared but not actively migrated. Real implementations must be source-traced to `testing/app/src/app/app.ts` before they can be marked implemented.

**Gap absorption**
- Legacy location: `buildGapAbsorptionResult` (line 3732)
- Legacy role: display-only diagnostic panel, no downstream consumer
- Migration note: current app-next service was invented from an incorrect source. Real implementation is a future feature.

**Fringe exchange**
- Legacy location: `buildFringeExchangeResult` (line 3986), uses `addRoomNegotiationFaces`
- Legacy role: display-only diagnostic panel, no downstream consumer
- Migration note: current app-next service was invented from an incorrect source. Real implementation is a future feature.

**Simplification**
- Legacy location: `buildSimplificationResult` (line 4298), uses `buildSimplificationFaces`
- Legacy role: display-only diagnostic panel, no downstream consumer
- Migration note: current app-next service was invented from an incorrect source. Real implementation is a future feature.

### Slice 9A — Warped Site Projection

Goal:

- project mass-balanced cells into UV space as typed Voronoi sites
- produce a `WarpedSiteArtifact` with explicit UV coordinates, weights, and radii
- this is the first step of the real verification-feeding warped pipeline

Status: Done

Delivered:

- `WarpedUvSite` and `WarpedSiteArtifact` types added to the artifact model
- `WarpedSiteProjectionService` with Newton-Raphson inverse bilinear quad mapping (source-traced from `buildPanel2WarpedSites` line 2948)
- `warpedSiteProjectionResult` signal on the Processing page consuming mass-balanced output
- Panel 5 on the Processing page showing UV site count, skipped degenerate cells, and source migration note
- Deferred panels (gap absorption, fringe exchange, simplification) relabeled as deferred future features with correct legacy source references
- Migration marker added in `testing/app/src/app/app.ts` at `buildPanel2WarpedSites`
- Step order corrected across REBUILD_ROADMAP, PROCESSING_PIPELINE_RULES, and AI_STEP_GUIDE

Source: `buildPanel2WarpedSites` in `testing/app/src/app/app.ts` (line 2948)

Step template:
- Slice number: 9A
- Stage category: Warped grid projection
- Purpose: Project each mass-balanced cell centroid into UV space via inverse bilinear quad mapping to produce typed Voronoi sites for downstream warped rebalancing.
- Inputs: `MassBalancedLayoutArtifact` + buildable quad points (4-corner polygon)
- Outputs: `WarpedSiteArtifact` (typed UV site list with id, u, v, weight, radiusMeters, targetSquareMeters per site)
- Owns: inverse bilinear quad projection per centroid, radius derivation from target area
- Does not own: UV Voronoi generation, weight rebalancing, world back-projection, residual absorption
- Upstream dependency: mass balance renegotiation
- Downstream consumer: warped Voronoi rebalance (9B)

### Slice 9B — Warped Voronoi Rebalance

Goal:

- rebalance UV site weights and positions through an iterative Voronoi pressure loop
- produce stable rebalanced UV sites for downstream boxing

Status: Done

Delivered:

- `WarpedRebalancedSiteArtifact` type added to the artifact model
- `WarpedVoronoiRebalanceService` with 18-iteration UV power Voronoi pressure loop (source-traced from `rebalanceWarpedSites` line 6244)
- All sub-functions ported from legacy: `scaleSitesToUvPowerWeights`, `clipCellByBisector`, `bilinearQuadPoint`, `inverseWarpedGrid`, `polygonsTouch`
- `warpedVoronoiRebalanceResult` signal consuming warped site projection output
- Panel 6 on the Processing page with iteration count, stable runs, and final max delta
- Migration marker added in `testing/app/src/app/app.ts` at `rebalanceWarpedSites` / `scaleSitesToUvPowerWeights`

Source: `rebalanceWarpedSites` in `testing/app/src/app/app.ts` (line 6244)

Step template:
- Slice number: 9B
- Stage category: Warped grid rebalance
- Purpose: Run UV-space Voronoi iteratively while adjusting site weights and drifting centroids under neighbor deficit pressure until area targets converge.
- Inputs: `WarpedSiteArtifact` + rebalance arguments (iterations, gain, drift gains, stability threshold)
- Outputs: `WarpedRebalancedSiteArtifact` (updated UV site list with converged weights and positions)
- Owns: 18-iteration UV Voronoi weight/drift loop, neighbor pressure propagation, weight normalization
- Does not own: UV boxing, world projection, edge negotiation, residual absorption
- Upstream dependency: warped site projection (9A)
- Downstream consumer: UV Voronoi boxing (9C)

### Slice 9C — UV Voronoi Boxing

Goal:

- run final UV Voronoi with power weights, extract UV bounding boxes per cell
- snap close edges to a safe edge grid
- back-project UV quads to world via bilinear interpolation

Status: Done

Source: `buildWarpedQuadCells` in `testing/app/src/app/app.ts` (line 5966)

Delivered:
- `uv-voronoi-boxing.service.ts` — full port of `buildWarpedQuadCells`
- `UvBoxedLayoutArtifact` added to `layout-processing-artifact.model.ts`
- `UvVoronoiBoxingService`, `UvVoronoiBoxingArguments`, `UvVoronoiBoxingMetrics`, `UvBoxedLayoutArtifact` exported from `processing.exports.ts`
- Processing page: injected service, added arguments (`snapThreshold: 0.05`, `minExtent: 0.04`), `uvVoronoiBoxingResult` computed signal, Panel 7 entry
- Migration marker added to legacy at line 5966
- Contains: `buildSafeSnap`, `absorbFreeUvSpace`, `hasOverlappingUvBoxes`, `scaleSitesToUvPowerWeights`, `clipCellByBisector`, `bilinearQuadPoint`, `polygonArea`
- Fallback: if snapped boxes overlap → use unsnapped boxes
- Step template:
  - Slice number: 9C
  - Stage category: UV box generation
  - Purpose: Run power Voronoi in UV space on rebalanced sites, quantize each Voronoi polygon to its UV axis-aligned bounding box, merge close edges safely, grow deficit boxes into free UV gaps, and project each UV rectangle back to world space via bilinear quad mapping.
  - Inputs: `WarpedRebalancedSiteArtifact` + snap/extent arguments
  - Outputs: `UvBoxedLayoutArtifact` (world-space rectangular cells derived from UV bounding boxes)
  - Owns: UV Voronoi clipping, UV box extraction, safe edge snap (`buildSafeSnap`), free-space absorption, bilinear back-projection
  - Does not own: deficit edge negotiation, residual gap filling, verification
  - Upstream dependency: warped Voronoi rebalance (9B)
  - Downstream consumer: UV edge negotiation (9D)

### Slice 9D — UV Edge Negotiation

Goal:

- shift shared box edges to redistribute area toward deficit cells
- rescue bad aspect ratios before gap filling

Status: Done

Source: `negotiateEdges` + `rescueClusteredAspectRatios` inside `buildClusteredGridCells` in `testing/app/src/app/app.ts` (line 5277)

Delivered:
- `uv-edge-negotiation.service.ts` — ports `negotiateEdges` and `rescueClusteredAspectRatios`
- `UvNegotiatedLayoutArtifact` added to `layout-processing-artifact.model.ts`
- `UvBoxedLayoutArtifact` updated to carry `quadPoints` (needed for UV back-projection)
- `UvEdgeNegotiationService`, `UvEdgeNegotiationArguments`, `UvEdgeNegotiationMetrics`, `UvNegotiatedLayoutArtifact` exported from `processing.exports.ts`
- Processing page: injected service, added arguments (`shiftGain: 0.05`, `maxPasses: 8`, `targetAspectRatio: 4.5`), `uvEdgeNegotiationResult` computed signal, Panel 8 entry
- Migration markers added to legacy at line 5192
- Step template:
  - Slice number: 9D
  - Stage category: UV box refinement
  - Purpose: Back-project UV-boxed world cells to UV coordinates, iteratively shift shared edges toward deficit-side neighbors, roll back on overlap, then rescue unacceptable aspect ratios.
  - Inputs: `UvBoxedLayoutArtifact` (with quadPoints) + negotiation arguments
  - Outputs: `UvNegotiatedLayoutArtifact` (world-space cells + quad)
  - Owns: deficit-driven edge shifting, overlap fallback, aspect ratio rescue
  - Does not own: residual gap detection, hallway/filler cell generation, final staging
  - Upstream dependency: UV Voronoi boxing (9C)
  - Downstream consumer: residual UV absorption (9E)

### Slice 9E — Residual UV Absorption

Goal:

- scan uncovered UV space after negotiated room boxes are placed
- fill gaps with hallway or filler residual cells via maximal-rectangle scan

Status: Done

Source: `buildResidualUvQuads` + `tryAbsorbResidualUvRect` inside `buildClusteredGridCells` in `testing/app/src/app/app.ts` (line 5584)

Delivered:
- `residual-uv-absorption.service.ts` — ports `buildResidualUvQuads` and `tryAbsorbResidualUvRect`
- `ResidualAbsorbedLayoutArtifact` added to `layout-processing-artifact.model.ts`
- `ResidualUvAbsorptionService`, `ResidualUvAbsorptionArguments`, `ResidualUvAbsorptionMetrics`, `ResidualAbsorbedLayoutArtifact` exported from `processing.exports.ts`
- Processing page: injected service, added arguments (`fillerColor`, `hallwayColor`), `residualUvAbsorptionResult` computed signal, Panel 9 entry
- Migration marker already added to legacy at line 5192 (alongside 9D marker)
- Step template:
  - Slice number: 9E
  - Stage category: Gap fill
  - Purpose: Identify UV rectangles not covered by room boxes, grow each seed into the largest contiguous uncovered rectangle, attempt absorption into adjacent deficit rooms first, then emit remaining gaps as hallway (interior) or filler (boundary-touching) residual cells.
  - Inputs: `UvNegotiatedLayoutArtifact` (world-space cells + quad) + color arguments
  - Outputs: `ResidualAbsorbedLayoutArtifact` (merged rooms + residuals = clusteredGridCells equivalent)
  - Owns: coverage grid scan, greedy maximal-rect growth, `tryAbsorbResidualUvRect`, boundary/interior classification, bilinear back-projection
  - Does not own: edge negotiation, aspect ratio rescue, verification
  - Upstream dependency: UV edge negotiation (9D)
  - Downstream consumer: final staging

## Warped Pipeline Status — All 5 Slices Complete

Slices 9A–9E are all delivered and wired. The real verification-feeding warped pipeline is now live in app-next:

| Step | Slice | Service | Status |
|------|-------|---------|--------|
| Warped site projection | 9A | `WarpedSiteProjectionService` | Done |
| Warped Voronoi rebalance | 9B | `WarpedVoronoiRebalanceService` | Done |
| UV Voronoi boxing | 9C | `UvVoronoiBoxingService` | Done |
| UV edge negotiation | 9D | `UvEdgeNegotiationService` | Done |
| Residual UV absorption | 9E | `ResidualUvAbsorptionService` | Done |

### Post-9E: Final Staging, Verification, and Survivor Promotion

Status: Done

Delivered:

- `ResidualAbsorbedLayoutArtifact` wired into `FinalStagingService` as the verified cell input
- `VerificationService` running deficiency, aspect ratio, access, adjacency, garage frontage, sliver, and overlap checks against final staged cells
- `VerificationOrchestratorService` queuing layouts and emitting `VerifiedLayoutArtifact`
- Verification page showing per-check pass/fail, cull reasons, and accepted/rejected layout stats
- `LayoutGalleryService` accumulating accepted `VerifiedLayoutArtifact` entries sorted by score
- Successes page showing the ranked gallery of accepted layouts with score breakdowns and cell schedules

### Post-9E: Construction Handoff Page

Status: Done

Delivered:

- `/construction` route and `ConstructionPageComponent` as the final pipeline stage
- `core/construction/external-wall.factory.ts` — edge-deduplication analysis producing typed `ConstructionExternalWallSegment` with `ownerTypeId`, `ownerKind`, `exteriorKind`, and `lengthMeters`; also builds external wall loops and area/perimeter metrics
- Construction page reads from `LayoutGalleryService`, binds to the top-ranked accepted layout as the construction candidate
- SVG preview with: colored room polygons, interior wall lines, external wall loop polylines (open loops flagged in orange), element markers
- External walls table (Processing pass 1): ID, owner, owner kind, exterior kind, length
- Cell schedule: all verified cells with type and area
- Checklist: 4-row readiness gate — layout identity, canonical geometry, typed contract (gated), Revit apply (gated)

### Construction Handoff — Typed Window Placements

Status: Done

Delivered:

- `core/construction/window-schedule.ts` — lookup table keyed by `typeId` with `sizeCode` (XS/S/M/L/XL), `widthMeters`, `maxPerWall`, `minWallMeters` per room type
  - Wet rooms: XS 0.45 m, max 1
  - Bedrooms/office/study/gym: M 0.90 m, max 2
  - Open living/dining: L 1.20 m, max 2–3
  - Storage/closet/garage/stairs/media: no window (null)
  - Default fallback: M 0.90 m, max 1
- `core/construction/window-placement.factory.ts` — `buildWindowPlacements(segments)` pure function producing `ConstructionWindowPlacement[]`
  - Each placement carries: `ownerTypeId`, `sizeCode`, `widthMeters`, `tNormalized`, `tMeters` (meters from wall start), `positionWorld` (real lot coordinates), `wallLengthMeters`
  - `positionWorld` is in the same coordinate space as cell geometry — usable directly by Revit for wall-hosted family placement
- `ConstructionExternalWallSegment` extended with `ownerTypeId` flowing from `cell.typeId` through `EdgeRecord` → factory output
- Construction page: `windowPlacements` signal is canonical data; `windowMarkers` derives SVG circles from it (radius = `widthMeters / 2 * scale`); window table shows ID / Room / Size / Width / Wall / Offset

### Construction Handoff — Typed Door Placements

Status: Done

Delivered:

- `core/construction/door-schedule.ts` — exterior door config table (`entry` 0.9 m for foyer, `garage` 2.4 m for garage, `service` 0.9 m for dirty_kitchen/laundry/mudroom) and `interiorDoorWidthForTypeId` (0.8 m for closet/pantry/storage/powder/utility, 0.9 m otherwise)
- `core/construction/door-placement.factory.ts` — `buildDoorPlacements(artifact, externalSegments)` pure function with two phases:
  - Phase 1 (exterior): scans external wall segments for rooms in the exterior door config, picks longest qualifying wall, places door centered at `t = 0.5`
  - Phase 2 (interior): builds a shared-edge map from all cell polygon edges, finds every enclosed room (no `open_access` tag, not pkg/hallway), selects best shared edge (hallway neighbor preferred, then longest), places one interior door
  - Each `ConstructionDoorPlacement` carries: `kind`, `ownerTypeId`, `ownerLabel`, `widthMeters`, `tMeters`, `positionWorld`, `wallFromWorld`, `wallToWorld`, `adjacentTypeId`, `adjacentLabel`
  - `wallFromWorld`/`wallToWorld` in real lot coordinates — used by component to compute SVG rotation angle and by Revit for door orientation
- Construction page: `doorPlacements` signal is canonical data; `doorMarkers` derives SVG `<rect>` elements from it (width = `widthMeters * scale`, rotated to align with wall via `atan2` in projected space); door table shows ID / Kind / Room / Width / Adjacent
- Door kinds styled distinctly: entry (warm orange), garage (blue), service (grey-green), interior (white/dark)

### Construction Outputs Gallery

Status: Done

Delivered:
- `ConstructionOutputService` — computed signal aggregating all gallery entries into ranked `ConstructionOutput` records; each output carries the full external wall analysis, typed door placements, and typed window placements
- `SpawnHeatmapService` — heatmap built from room centroids of all outputs; normalized 2D grid (0.5 m cells, 3 m tent kernel); exposed to simulation respawn scoring as a weak bias (−0.25 units max, on a 3–10 unit primary score scale)
- `/outputs` route + `OutputsPageComponent` — 3-column responsive card grid; auto-populates and re-ranks as new layouts are promoted; each card shows rank badge, layout ID, composite score, mini SVG thumbnail (280×170), 4-stat row (rooms / area / windows / doors), and 5-bar score breakdown
- Sliver check fix in `VerificationService` — hallway cells excluded from sliver fail; hallways are narrow by design and were incorrectly penalized

### Typed Construction Contract + Revit Endpoint Push

Status: Done

Delivered:
- `core/construction/construction-contract.model.ts` — `ConstructionContractExport` schema v1.0:
  - `cells` — all verified cells with worldPoints, typeId, label, color, area, hallway/pkg flags
  - `doors` — typed door placements (kind, owner, width, positionWorld, wallFromWorld, wallToWorld, adjacentTypeId)
  - `windows` — typed window placements (size code, width, positionWorld, wallFromWorld, wallToWorld, tMeters, wallLengthMeters)
  - `externalWalls` — all external wall segments (from, to, length, ownerTypeId, ownerKind, exteriorKind)
  - `metrics` — totalAreaSqm, roomCount, windowCount, doorCount, externalWallPerimeterMeters, score
- `core/construction/construction-contract.factory.ts` — `buildConstructionContract(output)` pure function; resolves wallFromWorld/wallToWorld for windows by joining on wallId from analysis segments
- `core/construction/construction-contract-push.service.ts` — reactive push service:
  - watches `ConstructionOutputService.outputs()` via `effect()`
  - deduplicates by `layoutId` (each layout pushed exactly once)
  - POSTs to `http://localhost:8765/layout-contract`
  - exposes `statusMap` signal: `pending → pushing → pushed | failed` per layoutId
- `/outputs` page shows push status badge per card (color-coded)
- `LocalApiServer.cs` (Revit platform) — new endpoints:
  - `POST /layout-contract` — stores contract JSON keyed by `layoutId`; accepts from the Angular app
  - `GET /layout-contracts` — returns all stored contracts as a JSON array; consumed by the Revit listener
  - `OPTIONS` preflight handler and `Access-Control-Allow-Origin: *` on all responses (CORS fix)

## Current Status

| Stage | Status |
|---|---|
| Simulation capture | Done |
| Warped pipeline (9A–9E) | Done |
| Final staging + verification | Done |
| Successes gallery | Done |
| Construction handoff page | Done |
| Typed window placements | Done |
| Typed door placements | Done |
| Typed construction contract (export shape) | Done |
| Construction outputs gallery | Done |
| Contract push to Revit endpoint | Done |
| Heatmap spawn bias | Done |
| Revit apply (preview + write) | Next — reads from `/layout-contracts` |

### Where We Are Now

The pipeline is complete from simulation capture through to contract delivery at the Revit HTTP bridge.

What is now live end-to-end:
- canonical verified geometry with worldPoints
- typed external wall analysis (ownerTypeId, ownerKind, exteriorKind, loops)
- typed window placements (sizeCode, widthMeters, positionWorld, wall endpoints, tMeters)
- typed door placements (kind, ownerTypeId, widthMeters, positionWorld, wall endpoints, adjacentTypeId)
- `ConstructionContractExport` v1.0 packaged and pushed to `POST /layout-contract` on the Revit platform
- Revit platform stores contracts by layoutId and exposes them via `GET /layout-contracts`
- Construction outputs gallery ranks all outputs by score with push status visible per card
- Spawn heatmap from construction room centroids weakly biases future simulation respawns

The next milestone is the Revit-side consumer: read contracts from `GET /layout-contracts`, preview in Revit as temporary geometry, then apply behind an approval gate.
