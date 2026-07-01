# Processing Pipeline Rules

## Purpose

This document defines how the legacy post-exploration processing path must be rebuilt into `app-next`.

The old app already proves that there is a real downstream processing sequence after layout exploration. That legacy behavior is useful reference material, but the new rebuild must not copy its monolithic shape.

The goal is:

- keep the old processing knowledge
- rebuild it into strict, self-contained steps
- make each step swappable, reorderable, and eventually argument-driven

## Legacy Processing Scan

The legacy `testing/legacy-reference/app/src/app/app.ts` processing path currently behaves like a chained schematic refinement pipeline.

### Migration Failure Note

This note is here because the migration drifted and needs to be called out plainly.

A bad migration mistake happened:

- the rebuild temporarily treated non-primary historical files as if they were the legacy migration source
- invented processing behavior was added instead of strictly porting from `testing/legacy-reference/app/src/app/app.ts`
- some steps were labeled or presented as implemented before they were source-faithful

That was wrong.

For this rebuild, `legacy` means:

- `testing/legacy-reference/app`
- especially `testing/legacy-reference/app/src/app/app.ts`

It does **not** mean:

- loosely borrowing from older side prototypes when the migration target was already defined more specifically
- inventing substitute algorithms to keep the page moving
- treating compiled scaffolding as completed migration

If a step cannot be traced back to `testing/legacy-reference/app/src/app/app.ts`, it must be treated as:

- not yet migrated
- provisional only
- not allowed to claim parity

This rule exists because fake completeness is more damaging than an explicit gap.

Observed major stages (real verification-feeding order from `testing/legacy-reference/app/src/app/app.ts`):

1. provisional constrained cell generation (`buildSchematicCells` — Panel 1 Voronoi)
2. hallway injection (path site seeding + Panel 2 Voronoi + mass balance inside `buildPanel2Cells`)
3. warped diagnostic staging (UV site projection + warped Voronoi rebalance)
4. mass balance renegotiation (post-warped deficit redistribution)
5. warped site projection (`buildPanel2WarpedSites` — line 2948)
6. warped Voronoi rebalance (`rebalanceWarpedSites` — line 6244)
7. UV Voronoi boxing (`buildWarpedQuadCells` — line 5966)
8. UV edge negotiation (`negotiateEdges` inside `buildClusteredGridCells` — line 5277)
9. residual UV absorption (`buildResidualUvQuads` — line 5584)
10. final staged output (`finalSchematicCells` — line 2821)
11. verification queueing and cull promotion (`schematicVerificationPassCheck` — line 7817)

Note: **Boundary edge stepping** is a Panel 1 display branch (`edgeCutVoronoiCells`). It does not feed `finalSchematicCells` or verification.

Note: **Gap absorption, fringe exchange, and simplification** are display-only diagnostic panels in the legacy with zero downstream consumers. They are deferred future features — see the Deferred Features section below.

## Deferred Future Features

These steps exist as typed placeholder services in app-next but have no real migrated implementation yet.

Real implementations must be source-traced to `testing/legacy-reference/app/src/app/app.ts` before any can be marked implemented.

### Gap Absorption

- Legacy: `buildGapAbsorptionResult` (line 3732) — uses `getAdaptiveTessellationCuts` (line 4834)
- Legacy role: display-only diagnostic, no downstream consumer
- Current app-next service: typed placeholder, algorithm was invented from wrong source
- When to implement: after the warped grid chain (9A–9E) is live and residual cells exist to absorb

### Fringe Exchange

- Legacy: `buildFringeExchangeResult` (line 3986) — uses `addRoomNegotiationFaces` (line 4633)
- Legacy role: display-only diagnostic, no downstream consumer
- Current app-next service: typed placeholder, algorithm was invented from wrong source
- When to implement: after gap absorption is source-faithful

### Simplification

- Legacy: `buildSimplificationResult` (line 4298) — uses `buildSimplificationFaces` (line 4487)
- Legacy role: display-only diagnostic, no downstream consumer
- Current app-next service: typed placeholder, algorithm was invented from wrong source
- When to implement: after fringe exchange is source-faithful

This sequence matters.

It shows that processing is not one transform. It is a family of transforms, filters, and promotions.

## Rebuild Policy

In `app-next`, processing must be rebuilt as a pipeline of explicit step services.

Do not rebuild processing as:

- one giant component
- one mega-service owning every step
- one huge function with many flags
- one shared mutable state bucket silently passed everywhere

Instead, rebuild it as:

- one service per real processing step
- one explicit request contract per step
- one explicit result contract per step
- one orchestrator service that runs the ordered step list

## Processing Step Service Rule

Each processing step must be represented by a dedicated service or service-like block.

Each step service should define:

- step id
- step label
- stage category
- input contract
- output contract
- allowed dependencies
- forbidden responsibilities

Each service should do one thing only.

Examples:

- one service for constrained Voronoi cell derivation
- one service for hallway injection
- one service for mass balance
- one service for edge stepping
- one service for gap absorption
- one service for fringe exchange
- one service for simplification

If a step has multiple internal helpers, those helpers may live beside the step service, but the step still needs one clear public execution boundary.

## Strict Input / Output Rule

Every processing step must consume and produce typed data explicitly.

Each step should answer:

- what exact layout artifact comes in
- what exact processing arguments come in
- what exact artifact goes out
- what metrics, warnings, or traces are attached
- whether the step is deterministic, seeded, or stateful

No step should depend on hidden app fields or route-page state.

If a future agent cannot call the step with a typed request object and understand the result without reading the whole feature, the step is not isolated enough.

## Self-Contained Step Rule

Each processing step must be self-contained enough to be:

- inserted
- removed
- replaced
- reordered
- configured with step-specific arguments later

That requirement is intentional.

Future product direction may allow:

- different step orderings
- feature-flagged step enablement
- variable arguments per run
- experimental alternate processing strategies

If steps are not self-contained now, that future flexibility becomes expensive later.

## Orchestrator Rule

Processing orchestration belongs in a dedicated orchestrator service.

The orchestrator may own:

- ordered step registration
- execution order
- step enable/disable checks
- handoff from one step result to the next
- processing history/log assembly

The orchestrator must not absorb:

- the internals of each step
- geometry math for each refinement
- display shaping

It is a conductor, not the whole orchestra.

## Block Comment Rule

Every processing step implementation must carry a local block comment near the execution boundary.

Minimum block comment shape:

- Slice number:
- Stage category:
- Step id:
- Purpose:
- Inputs:
- Outputs:
- Allowed dependencies:
- Forbidden responsibilities:

This is mandatory for processing rebuild work.

## Process Panel Rule

The Processing page in `app-next` must expose the chain as one visible panel per declared process step.

That means:

- implemented steps get their own panel with live preview/data when available
- pending steps still get their own panel with declared purpose, input, and output
- the page may assemble presentation metadata for those panels
- the page must not absorb step logic or become a hidden processing service

This rule exists so a later AI or human can open the page and immediately see:

- what steps exist
- which ones are already migrated
- what each step consumes
- what each step is expected to emit

## Suggested Step Contract Shape

Each step should eventually resemble this conceptual structure:

- `LayoutProcessingStepRequest`
- `LayoutProcessingStepResult`
- `LayoutProcessingStepService`

The result should include:

- resulting artifact
- metrics
- warnings
- traces or notes
- whether the step changed the artifact materially

## Immediate Rebuild Guidance

Before porting any legacy processing math into `app-next`:

1. Define the processing contracts.
2. Define the orchestrator boundary.
3. Define step ids and step order.
4. Define one service per real step.
5. Only then start porting step logic from the legacy app.

This means structure comes before heavy migration.

## Current Decision

`app-next` will use the old processing logic as behavioral reference while placing a new structure on top of it.

That structure is:

- strict input/output contracts
- self-contained step services
- explicit step ordering
- an orchestrator service for pipeline execution

That decision should be treated as active rebuild policy, not optional cleanup.

## First Rebuilt Step

The first rebuilt downstream processing step in `app-next` is:

- provisional constrained cell generation

Its current job is intentionally narrow:

- consume one captured layout artifact from Layout Exploration
- consume one explicit buildable polygon argument set
- emit provisional canonical room/circulation/filler cells

It does not yet own:

- hallway injection
- mass balancing
- edge stepping
- gap absorption
- fringe exchange
- simplification
- verification

The second rebuilt downstream processing step is now:

- hallway injection

Current rebuild note:

- the hallway injection step is already isolated as its own service
- it currently uses direct-path hallway seeding from foyer to sleeping targets
- this is intentional as an intermediate migration seam
- later migration should replace that path source with the richer legacy access-path graph without collapsing the step boundary

The third rebuilt downstream processing step is now:

- warped orthogonalization

Current rebuild note:

- the warped orthogonalization step is isolated as its own service before mass balance
- this step uses the legacy warped-grid lineage as the behavioral reference:
- constrained UV Voronoi partition
- snapped UV box reconstruction
- free-space absorption
- overlap fallback when snapped boxes collide
- this step must remain a real repartition step, not a visual cleanup layer

The fourth rebuilt downstream processing step is now:

- mass balance renegotiation

Current rebuild note:

- the mass-balance step is isolated as its own service after warped orthogonalization
- it rebalances generated cells toward target areas before boundary stepping or cleanup passes
- it must remain separate from edge stepping, gap absorption, fringe exchange, and simplification

The fifth rebuilt downstream processing step is now:

- boundary edge stepping

Current rebuild note:

- the boundary edge stepping pass is isolated as its own service after mass balance renegotiation
- it orthogonalizes eligible exterior edges without absorbing later cleanup or diagnostic work
- later migration should keep warped diagnostic staging, gap absorption, fringe exchange, and simplification outside this step boundary

The sixth rebuilt downstream processing step is now:

- gap absorption

Current rebuild note:

- the gap-absorption seam is now live as its own typed checkpoint after boundary edge stepping
- it currently reports occupied area and residue instead of fully porting the legacy claim-and-expand geometry logic
- the geometry-claim migration must still stay isolated inside this step when it is ported

The seventh rebuilt downstream processing step is now:

- fringe exchange

Current rebuild note:

- the fringe-exchange seam is now live as its own typed checkpoint after gap absorption
- it currently forwards geometry while preserving the place where legacy transfer scoring and conflict resolution will later land
- that legacy transfer logic must not leak into simplification or final staging

The eighth rebuilt downstream processing step is now:

- simplification

Current rebuild note:

- the simplification seam is now live and performs lightweight vertex cleanup before final staging
- it must remain a post-cleanup geometry pass rather than a hidden fix-up layer for earlier repartition steps

The ninth rebuilt downstream processing step is now:

- final staged output

Current rebuild note:

- final staging is now a real checkpoint in `app-next`
- this is the current stop point for the migrated processing chain
- verification queueing, culling, and promotion still remain downstream of this checkpoint

