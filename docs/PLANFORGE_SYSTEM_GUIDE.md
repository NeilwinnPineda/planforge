# Planforge System Guide

## Purpose

This guide centralizes the system-side rules for `planforge`.

Use it for:

- architecture boundaries
- pipeline rules
- terminology
- processing structure
- testing and reporting expectations

## System Mission

`planforge` should take structured residential design input and produce geometry that can be:

- generated
- inspected
- refined
- verified
- exported

The app should be designed around canonical output data, not around temporary UI behavior.

## Ownership Boundary

`planforge` owns:

- browser workflow
- generator-side architecture
- geometry, simulation, processing, and verification before Revit
- exports produced before Revit import
- app-local tests and E2E

`planforge` does not own:

- Revit thread routing
- Revit transaction handling
- Revit preview/apply mutation logic
- arbitrary bridge execution as a product path

## Architecture Rules

### Product Viability Rule

Structural work should improve product viability, not only code cleanliness.

Bias toward:

- clearer workflow
- less fragmented stage experience
- better comparison and decision support
- stronger handoff readiness

### Anti-Monolith Rule

Monolithing is not allowed.

Do not let one component, service, or file absorb:

- UI composition
- orchestration
- geometry math
- scoring
- persistence
- reporting
- pipeline transforms

If a file becomes the default place to "put the next thing," split it.

### Separation Rule

Keep these concerns separate:

- shell and navigation
- feature-route orchestration
- domain models and typed contracts
- source loading
- geometry and simulation
- processing steps
- verification
- reporting
- projection and view models
- presentation

### Service Ownership Law

Main process logic must live in service-owned blocks.

That includes:

- stage orchestration
- cross-step pipeline execution
- argument assembly for real pipeline stages
- verification gating
- promotion or cull decisions
- reporting payload assembly for pipeline events
- construction-stage assembly from verified artifacts

Page components may:

- select which service-owned result to show
- format values for display
- map canonical results into route-local presentation models
- trigger service-owned actions

Page components must not become the long-term owner of:

- multi-step processing chains
- duplicated pipeline argument bundles
- verification pipeline reruns
- construction handoff assembly
- reporting side effects for core pipeline events

If a route needs to recompute or assemble the same pipeline result in more than one place, extract a dedicated service immediately.

### Canonical Data Rule

Canonical data is the source of truth.

Examples:

- world-space room and cell geometry is canonical
- verification metrics are canonical analysis output
- SVG polygon strings and panel rows are derived display data

### Final Contract Normalization Rule

The final exported contract must describe resolved house geometry, not pipeline history.

That means the export should not leak intermediate provenance labels such as:

- `generated_hallway_residual_*`
- `generated_filler_residual_*`
- partially merged hallway fragments that still reflect processing-stage leftovers

If geometry is already known or derivable upstream, the final contract should preserve that resolved meaning instead of dropping it and forcing later stages or viewers to infer it again.

This especially applies to:

- interior-wall carry-through
- hallway/filler normalization
- final semantic ownership of geometry

If a downstream export still exposes intermediate artifact classes, that is a pipeline integrity bug, not only a presentation issue.

### Standalone App Rule

`planforge` must remain valid as its own app.

That means:

- build, serve, and test should run from `apps/planforge`
- browser logic should not depend on Revit availability
- exports should form the boundary to Revit

## Pipeline Mental Model

Treat the app as an evolvable pipeline:

1. source authoring
2. typed loading
3. constraint derivation
4. candidate generation
5. candidate refinement
6. validation and scoring
7. selection and promotion
8. projection into display space
9. presentation

New steps, reordered stages, and replacement heuristics are expected over time.

That is why each stage should be self-contained and explicitly documented.

## Parallelism Rule

Simulation parallelism should be treated as orchestration policy, not as a fixed product truth.

The current fixed instance cluster is acceptable for now.

Future direction should be dynamic parallelism:

- scale instance count according to workload and machine headroom
- respond to capture yield and downstream backlog
- avoid hard-coding one permanent sibling count as the long-term model

If dynamic scaling is added later, it should stay owned by service-level orchestration instead of route components or shell presentation.

## Terminology Rules

Use these terms deliberately:

- `generation`: create new candidates from rules, constraints, or seeds
- `refinement`: reshape generated output without changing the upstream brief
- `validation`: check output against rules and invariants
- `selection`: choose among candidates
- `projection`: convert world geometry into screen-space data
- `presentation`: show projected output in the UI

Do not flatten all stages into "generation" or "rendering."

## Early Geometry Rule

Early geometry should stay shape-agnostic unless the stage truly resolves shape.

Prefer terms like:

- spatial claims
- occupancy regions
- influence regions
- provisional polygons
- candidate cells

Avoid implying early rectangles are the final room truth.

## Processing Architecture

Processing is a chain of explicit steps, not one giant transform.

The app should use:

- one service per real processing step
- one typed request/result boundary per step
- one orchestrator for step order
- one visible panel per declared step on the Processing route

The orchestrator may own:

- execution order
- step enablement
- step history
- handoff from one result to the next

The orchestrator must not absorb step internals.

## Active Extraction Targets

The current mandatory extraction targets are:

1. one reusable downstream pipeline service for:
   - captured layout -> provisional cells -> hallway -> warped/UV steps -> residual -> hallway merge -> final staging -> canonical geometry -> verification
2. one service-owned reporting path for verification and pipeline diagnostics
3. one service-owned construction-stage assembly path for:
   - selected verified layout -> wall analysis -> door placements -> window placements -> downstream contract-ready construction output

This means:

- Processing and Verification routes should consume the same service-owned pipeline snapshot instead of rebuilding the chain separately.
- Construction pages should consume service-owned assembled outputs instead of recreating wall/door/window derivation locally.

Current implementation status:

- `ProcessingPipelineService` now owns the shared downstream capture-to-verification chain used by Processing, Verification, and the verification orchestrator
- `ConstructionOutputService` remains the service-owned construction assembly boundary, and the Construction route now consumes that assembled output instead of re-deriving the same wall/door/window package in-page
- remaining route-local work is now mostly presentation projection and preview shaping, not duplicated core pipeline execution

## Processing Step Rule

Each processing step should define:

- step id
- stage category
- purpose
- input contract
- output contract
- metrics or warnings
- allowed dependencies
- forbidden responsibilities

Each step should be self-contained enough to be:

- inserted
- removed
- replaced
- reordered
- configured independently later

## Current Processing Reality

The live downstream chain already includes real processing services and verification-feeding steps.

The important policy is not memorizing every slice number.

The important policy is:

- preserve explicit step boundaries
- port behavior from the designated legacy source when doing migration
- do not hide processing math inside page components

## Migration Source Rule

When the task is migration, the source boundary matters more than convenience.

For migration work, use:

- `testing/legacy-reference/app`
- especially `testing/legacy-reference/app/src/app/app.ts` for the processing lineage

Do not substitute a different historical file just because it is easier to read.

## Testing And Reporting Rules

### Reporting Rule

The app should report what happened, not only final scores.

Useful reporting should support inspection of:

- source identity
- stage identity
- output identity
- intermediate artifacts
- validation findings
- final or rejected geometry

### Test Rule

Feature work should update automated tests as part of completion.

Use the most appropriate layer:

- unit tests for pure logic
- integration tests for cross-service behavior
- E2E for route and workflow behavior

If coverage is intentionally deferred, document the gap.

### Runtime Inspection Rule

Build success is not enough for this app.

Use runtime inspection when the route behavior matters, especially for simulation-heavy checkpoints.

### Current Verified Validation Notes

Latest local validation snapshot from 2026-07-02 after service-boundary extraction:

- `npm.cmd run build` passes
- build currently emits a bundle-budget warning: initial bundle `613.70 kB` versus configured `500 kB`
- `npm.cmd test -- --watch=false` passes with `34` tests across `6` files
- `npm.cmd run test:contracts` passes
- `npm.cmd run test:e2e` passes with `22` Playwright tests
- `npm.cmd run debug:runtime-inspection` passes against `/simulation`

Observed runtime details from the latest inspection:

- preview bubble count: `14`
- uncaught exceptions: `0`
- Angular dev-mode warnings: `allowSignalWrites` deprecation warnings are still emitted from active code paths
- network noise: `/favicon.ico` returns `404` during local serve

Operational note:

- `npm.cmd run export:live` is a long-running search/export script, not a fast validation lane
- it currently targets `1000` accepted layouts before writing `generated-exports/live-layout-contract.json`
- do not treat it as equivalent to build, unit, contract, runtime-inspection, or E2E smoke checks

### Current Experiment Note

Latest inspected exported contract from the 2026-07-02 Wide Family Lot run confirms a first-fix priority around final-contract normalization:

- interior-wall carry-through is not yet preserved strongly enough in the final handoff shape
- hallway merge output still contains fragmented residual hallway geometry
- filler and hallway geometry still leak provenance naming into the final export
- UV/aspect-ratio handling likely still distorts some downstream world-space decisions before merge and residual cleanup

The near-term bug-fix goal is to make the contract read like resolved final geometry rather than a snapshot of the internal processing lineage.

## Folder Intent

Default responsibilities:

- `src/app/core`: canonical pipeline logic, contracts, stable services
- `src/app/features`: route-level inspection surfaces and page-local shaping
- `src/app/shell`: app frame and navigation only
- `src/app/shared`: truly generic cross-feature helpers

If logic belongs to a domain stage, keep it with that stage instead of hiding it in generic shared helpers.

## Practical Build Rule

When unsure where code belongs:

1. put canonical pipeline logic in `core`
2. put route-local shaping in `features`
3. keep shell for frame concerns only
4. prefer a new focused file over enlarging an ambiguous one

## Current Implementation Direction

The current system direction is:

- canonical-data-first
- explicit typed boundaries
- standalone browser app ownership
- processing as isolated services
- reporting and tests as part of the architecture

## Active Undocumented Notes Now Captured

These practical notes are now part of the documented system state:

- the product name is `planforge`, but the npm package name remains `app-next`
- local runtime inspection is currently healthy enough to use as a real checkpoint signal
- bundle budget drift is real and should stay visible until the configured budget or bundle size is addressed
- `allowSignalWrites` deprecation warnings are present in active runtime paths and should be cleaned up when touching those services
- favicon handling is still incomplete for local serve

## Success Standard

The system layer is working when a future contributor can quickly understand:

- what each stage consumes
- what it produces
- where it belongs
- what it is allowed to own
- how to test or inspect it
