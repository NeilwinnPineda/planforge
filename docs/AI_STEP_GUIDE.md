# AI Step Guide

## Purpose

This guide exists so a future AI agent can continue the rebuild of `apps/planforge` without getting lost, without guessing where logic belongs, and without recreating monolithic structure.

Use this guide together with:

- `docs/PLANFORGE_SYSTEM_GUIDE.md`
- `docs/REBUILD_ROADMAP.md`
- `docs/PLANFORGE_PRODUCT_GUIDE.md` when the task affects the product workflow or UI layer
- local block comments near the code being changed

## First Orientation Pass

Before writing code, a future agent should check these in order:

1. Read `docs/PLANFORGE_CENTRAL_GUIDE.md`.
2. Read `docs/PLANFORGE_SYSTEM_GUIDE.md`.
3. Read `docs/REBUILD_ROADMAP.md`.
4. Identify the next unfinished slice number.
5. Identify whether the work belongs to source intake, generation, refinement, validation, reporting, projection, or presentation.
6. Confirm whether the change should live in `core`, `features`, `shell`, or `shared`.

If the work does not fit cleanly in one of those categories, stop and define the block boundary before coding.

## Migration Source Obedience Rule

If the task is migration, do not optimize the source choice for convenience.

Do not decide source based on:

- which file is easier to read
- which file is shorter
- which version feels cleaner
- which historical prototype is easier to port from

If the project already defines the migration source, obey it.

For this rebuild:

- `testing/legacy-reference/app` is the migration source boundary
- `testing/legacy-reference/app/src/app/app.ts` is the primary processing migration source

That means a future AI must not switch to older historical files as a substitute just because they are easier to scan.

In migration work, source obedience is more important than convenience.

## Folder Intent

Use these folder responsibilities as the default rule.

### `src/app/core`

Use `core` for stable pipeline blocks and domain contracts.

Examples:

- typed models
- source readers
- canonical geometry factories
- generation-stage services
- validation-stage services
- reporting adapters

Do not put route-page display shaping here unless it is truly reusable or canonical.

### `src/app/features`

Use `features` for route-level or slice-level user-facing inspection surfaces.

Examples:

- page components
- page-local view models
- page-local projection mappers
- slice-specific display helpers

Do not let a feature page absorb canonical pipeline behavior that should outlive the page itself.

### `src/app/shell`

Use `shell` for app frame concerns only.

Examples:

- navigation
- route host layout
- top-level shell composition

### `src/app/shared`

Use `shared` only for narrow cross-feature helpers that are truly generic and not secretly owned by one domain stage.

If a helper is really geometry-specific, generation-specific, or reporting-specific, keep it with that domain instead.

## Step Numbering Rule

Every meaningful rebuild slice should be referred to by slice number in docs and, where practical, in block comments.

Current known slices:

1. Slice 0: Foundation workspace
2. Slice 1: Source intake
3. Slice 2: Reporting baseline
4. Slice 3: Lot geometry
5. Slice 4: First candidate layout generation
6. Slice 5: Simulation engine foundation
7. Slice 6: Real simulation prerequisites and inspection checkpoint
8. Slice 7: Simulation capture checkpoint
9. Slice 8A: Processing handoff and provisional cells
10. Slice 8B: Hallway injection
11. Slice 8C: Mass balance renegotiation
12. Slice 8D: Boundary edge stepping (Panel 1 display branch — diagnostic panel, not in main verification chain)
13. Slice 9A: Warped site projection (real verification-feeding chain begins here)
14. Slice 9B: Warped Voronoi rebalance
15. Slice 9C: UV Voronoi boxing
16. Slice 9D: UV edge negotiation
17. Slice 9E: Residual UV absorption
18. Slice 10A: Final staging and verification queue
19. Slice 10B: Successes gallery and survivor promotion
20. Slice 10C: Construction handoff page and external wall analysis
21. Slice 10D: Typed window and door placements

If a slice is split further, sub-label it locally in docs using a stable name such as:

- `Slice 4A: Candidate seed projection`
- `Slice 4B: Candidate capture reporting`

Do not silently create hidden sub-stages in code without documenting them.

## Step Template

Before implementing a new block, define it in this shape:

- Slice number:
- Stage category:
- Purpose:
- Inputs:
- Outputs:
- Owns:
- Does not own:
- Upstream dependency:
- Downstream consumer:
- Reporting impact:
- Test expectation:

This can be short, but it should exist in the doc update and near the code if the block is non-trivial.

## Allowed Responsibility By Block Type

### Models

Models may define:

- typed contracts
- enums or literal unions
- stable payload shapes

Models must not hide behavior-heavy transforms.

### Factories / Mappers

Factories and mappers may define:

- deterministic transforms
- derived view models
- canonical geometry derivation
- projection transforms

Factories and mappers should document exact input and output contracts.

They should not quietly read broad shared mutable state.

### Services

Services may define:

- stage orchestration
- stage access
- boundary adapters such as loading or reporting

Services should not become mixed ownership buckets for unrelated stages.

### Page Components

Page components may define:

- route-facing composition
- display assembly
- calls into services, mappers, and view-model builders

Page components should stay thin enough that a future AI can understand them quickly.

If a page starts containing significant math, canonical transforms, or multiple unrelated derivations, split it.

## Anti-Monolith Checklist

Run this checklist before extending any existing file:

1. Am I adding a second responsibility to this file?
2. Will this block be reused by another page or stage?
3. Does this logic need its own input/output documentation?
4. Is the page component starting to own procedural logic?
5. Am I relying on shared state instead of explicit inputs?
6. Would a new AI know where to put the next related change?

If two or more answers are "yes", do not extend the file directly without extracting a new block.

## Doc Update Rule

Every slice update should touch docs in at least one of these ways:

- update `REBUILD_ROADMAP.md`
- add or update a slice-specific note
- add migration trace notes in the old and new code locations
- update this guide if the continuation path changed

## Testing Rule For Continuation

Each slice should be tested before the next slice begins.

Minimum expectation:

- verify the route/page still renders
- verify the new block respects its documented input/output contract
- verify reporting still works if the slice touches reporting
- verify no page component swallowed a new core responsibility
- verify the rebuilt slice is not merely visual scaffolding when the checkpoint is meant to represent active procedural state
- when available, use the runtime inspection path to check for browser-side errors and empty-state failures that build/test may miss

## Current Checkpoint Guidance

The current rebuild checkpoint is not "show a simulation-looking page."

It is:

- real simulation state must be running
- prerequisite forces and seeded support bubbles must be present where the old step depends on them
- capture evaluation must be happening against live simulation state
- inspection panels must expose enough metrics to judge whether the simulation is behaving plausibly

Do not advance to capture migration or downstream geometry while this checkpoint is only partially represented.

## Construction Handoff Pattern

Construction handoff follows the same canonical-data-first rule as the rest of the pipeline.

The pattern for typed element placements (`core/construction/`):

1. **Schedule file** (`*-schedule.ts`) — lookup table keyed by `typeId`. Returns a typed rule or `null` (no element). No Angular, no geometry, just config.
2. **Placement factory** (`*-placement.factory.ts`) — pure function taking canonical pipeline data (wall segments or `VerifiedLayoutArtifact`), returning typed placement objects. Each placement carries:
   - `positionWorld` — real lot coordinate, same space as cell geometry
   - `tMeters` — offset from wall/edge start in meters
   - `widthMeters` — physical element size
   - Wall reference fields (`wallFromWorld`, `wallToWorld` for doors; `wallId` for windows)
   These are the three values Revit needs to place a wall-hosted family.
3. **Feature page** (`features/construction/`) — reads canonical placements via computed signals, derives SVG display from them (pixel positions, sizes, rotations). Visual representation is always derived, never primary.

**Rule:** if a new construction element type is added (e.g., skylights, columns), follow this same three-file pattern. Do not add display logic to the factory or construction logic to the page.

**Current `core/construction/` files:**

| File | Purpose |
|---|---|
| `external-wall.factory.ts` | Edge-dedup analysis → typed external wall segments with `ownerTypeId` |
| `window-schedule.ts` | Window size rules by `typeId` |
| `window-placement.factory.ts` | Typed window placements from wall segments |
| `door-schedule.ts` | Door kind and width rules by `typeId` |
| `door-placement.factory.ts` | Typed door placements (exterior + interior shared-edge) |

**Next frontier:** `ConstructionContractExport` — the typed payload that bundles verified cells + window placements + door placements for the Revit HTTP bridge. This is the last gated step before Revit apply.

Current positive development:

- `app-next` now has a headless runtime inspection script for the simulation route
- that script has already caught a real browser-side simulation initialization bug
- future simulation work should use it as part of checkpoint verification, not only rely on build/test status

Current simulation checkpoint also includes:

- multiple live force families, not just matrix attraction and repulsion
- inertia-aware force application
- reset respawn randomness for fresh unbiased retries
- explicit boundary-preference tags such as `front_facing` and `vista`
- a simulation engine instance boundary, with the current app using one active instance through a registry-style facade
- automatic cluster expansion from one primary engine toward four managed instances
- an explicit cluster-orchestrator surface that compiles accepted captures across instances into one score-sorted gallery list
- a single global control bar for whole-system run/pause/clear, with instance inspection kept inside the simulation feature page
- generated filler-to-generated filler relationships now honor generated-type defaults, so filler/filler uses strong repulsion (`1`) instead of falling back to ordinary same-type repulsion (`2`)

Future agents should scan the current force families before adding another special behavior so the simulation layer does not drift into duplicated or conflicting pulls.

Future gallery or comparison work should prefer creating or selecting simulation instances through the simulation facade instead of rebuilding timer ownership in feature code.

For the current checkpoint, the cascade count is intentionally hard-set:

- one primary instance
- three spawned sibling instances

Treat that as a checkpoint constant, not a forever design limit. If future work makes the count dynamic, update the docs and keep the orchestration boundary separate from page composition.

## Processing Continuation Rule

When the rebuild moves beyond Layout Exploration and begins downstream processing:

1. Read `docs/PLANFORGE_SYSTEM_GUIDE.md`.
2. Do not port legacy processing math into a page component.
3. Do not create one generic processing service that hides many internal phases.
4. Define one service per real processing step.
5. Define strict typed request/result contracts before porting heavy logic.
6. Keep orchestration in a dedicated processing orchestrator service.

The legacy app proves there are many real downstream steps.

That is exactly why the rebuild must not collapse them back into one file.

Current processing checkpoint:

- captured layouts preserve full bubble artifacts for downstream processing
- provisional constrained cells, hallway injection, warped diagnostic staging, and mass balance renegotiation are live services
- boundary edge stepping is live as a diagnostic panel (Panel 1 display branch — not in the real verification-feeding chain)
- gap absorption, fringe exchange, and simplification are typed deferred stubs — real implementations are future features, current services were invented from the wrong source
- the real verification-feeding warped pipeline (9A–9E) is the active migration target
- the current live downstream output for verification purposes is the post-mass-balance artifact
- Slices 9A–9E (warped site projection through residual absorption) should attach in order after mass balance

## Practical Continuation Rule

If you are a future AI and you are unsure where code belongs:

1. Put canonical pipeline logic in `core`.
2. Put route-local inspection shaping in `features`.
3. Put only navigation and frame concerns in `shell`.
4. Prefer a new small file over enlarging an ambiguous one.

When in doubt, choose the option that keeps the next agent from having to read unrelated code.

