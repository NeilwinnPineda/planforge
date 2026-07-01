# Architecture Rules

## Purpose

This document defines the architecture rules for the standalone `planforge` app repo.

`planforge` may be linked into `ProjectRevit` for integrated development, but it is not just a temporary folder inside that repo. It is intended to stand on its own as the generator-side product workspace.

The goal is not to clone the old prototype. The goal is to rebuild the workflow in operational order, with clean boundaries and clean handoff at every step.

At the application level, the purpose of `planforge` is to take a structured design data source and output polygonal building-layout geometry that can be inspected, validated, compared, and eventually handed downstream.

That means the app should be designed around canonical geometric output, not around temporary UI effects or loosely connected intermediate screens.

The intended output of the system includes:

- room polygons
- circulation or hallway polygons
- buildable-envelope-aware layout polygons
- layout-level metrics and validation results attached to that geometry

Visual interfaces are important, but they are downstream views of the generated layout data.

## Non-Monolith Rule

Monolithing is explicitly disallowed in this app.

That means:

- No mega-component that owns multiple feature paths.
- No giant `app.ts` or equivalent control file that absorbs unrelated concerns.
- No dumping large copied logic blocks from the legacy prototype into one new location.
- No feature implementation that mixes UI, orchestration, geometry, scoring, persistence, and debug reporting in one file.

If a file starts becoming the default place for "everything", stop and split it before continuing.

Anti-monolith protection is mandatory, not optional cleanup for later.

Before extending an existing file, check whether the new work belongs to the same responsibility already documented there.

If the answer is "partly" or "not really", create or extend a neighboring block instead of expanding the file.

### Monolith Protection Triggers

Treat these as mandatory split signals:

- A page component starts owning domain transforms, geometry math, reporting payload creation, and visual shaping together.
- A service becomes the shared owner for unrelated stages just because it is convenient.
- A file needs long section comments just to explain multiple unrelated responsibilities.
- A new step cannot document a clean input and output contract without referencing hidden shared state.
- A future agent would have to scan large unrelated code regions to safely change one block.
- A file becomes the default place to "just put the next thing" because no clearer home exists.

When one of these triggers appears, stop feature expansion and extract the new responsibility first.

### Page Component Protection

Page components are not allowed to become logic sinks.

Page components may own:

- route-level orchestration
- dependency wiring
- page-local display state
- calls into already-defined stage or projection blocks

Page components should not become the long-term home for:

- canonical geometry derivation
- procedural generation rules
- validation engines
- reporting contract assembly
- reusable projection math
- stage-crossing data transforms

If a page needs more than light shaping for display, move that shaping into a dedicated mapper, factory, or view-model block with its own documentation.

## Rebuild Rule

The rebuild must happen one feature path at a time, in execution order.

Each feature path should be delivered as:

1. A clear user-facing purpose.
2. A bounded set of components/services/models.
3. A short doc update describing what was added.
4. A handoff-safe state before the next feature path begins.

Each delivered feature path must also declare:

- its slice number
- its pipeline stage type
- its upstream dependency
- its downstream output
- whether it produces canonical data or derived display data

## Migration Trace Rule

Migration must stay traceable at the block level, not just at the file level.

When a meaningful block from the legacy app is rebuilt in `app-next`:

- Add a short note in the old location that the block has been moved or replaced.
- Add a short note in the new location stating what legacy behavior it replaces.
- Keep the note close to the actual code block, not only in a top-level doc.

The purpose is to prevent "did we already move this?" confusion during the rebuild.

These notes should be short and practical. They are migration markers, not essays.

## Legacy Boundary Rule

`testing/legacy-reference/app` is the legacy reference implementation.

- It may be studied for behavior and lessons.
- It should not be treated as a source for bulk migration.
- New architecture decisions should be made for `app-next`, not inherited blindly from the legacy shape.

### Failure Record

This rebuild already hit a preventable failure and it needs to stay documented.

Codex is a fuck face lazy AI.

The failure pattern was:

- too much AI scaffolding
- too much forward claiming
- not enough strict source migration
- treating "builds" as if that proved "migrated"

More specifically:

- the migration boundary was ignored
- `legacy` was allowed to drift away from the explicitly intended `testing/legacy-reference/app` source
- replacement logic was invented for downstream processing steps instead of being ported from source
- some process panels implied completion before the behavior was actually source-backed and inspectable

That behavior should be treated as incorrect rebuild conduct.

The correction rule is:

- migrate from `testing/legacy-reference/app` first
- declare gaps honestly
- never mark a step implemented unless it is source-traced and inspectable
- never use scaffolding language to hide missing migration work

### No Tradeoff Rule For Migration

Migration work is not a convenience-optimization task.

That means an AI is not allowed to make tradeoffs like:

- easier file to read
- smaller file to scan
- older prototype feels simpler
- this other source looks close enough

When the migration source is already designated, the AI must follow that source even if:

- it is larger
- it is uglier
- it is more monolithic
- it is slower to understand

For this rebuild, if the task is migration, then:

- `testing/legacy-reference/app` is the source boundary
- `testing/legacy-reference/app/src/app/app.ts` is the primary source for processing migration
- an easier historical file is not a valid substitute

Choosing an easier source because it is easier to read is lazy behavior and must be treated as incorrect conduct.

If future work starts drifting into invention again, stop and retrace the source before continuing.

## Separation Rules

Keep these concerns separate:

- App shell and navigation
- Feature-path orchestration
- Procedural generation stages
- Domain models and typed contracts
- Data access and source loading
- Geometry / simulation logic
- Verification logic
- Visual projection and rendering preparation
- Debug / reporting adapters
- Presentation components and styling

If a change touches several of these, split the work by responsibility.

## Procedural Generation Rule

`app-next` is a procedural generation application and must be treated as such.

That means the system should be described and designed as a staged generation pipeline, not as a loose collection of screens and helper methods.

Preferred framing:

- source data / design brief
- derived constraints
- generation stages
- refinement stages
- validation stages
- canonical polygon output
- projection stages
- presentation output

When writing code or docs, prefer technically correct pipeline language over vague UI-first wording.

## Geometry Agnosticism Rule

Early geometry stages must stay lot-agnostic and room-shape-agnostic unless a later validated stage explicitly chooses a more specific shape grammar.

That means:

- do not treat axis-aligned rectangles as the default room truth
- do not let early convenience geometry become the canonical long-term contract by accident
- do not make irregular or non-orthogonal geometry feel like an exception case
- prefer early spatial claims, occupancy regions, influence regions, or provisional polygons when room shape is not yet actually resolved

The app should support irregular lots and non-regular room geometry as normal design conditions, not late corrections.

If an early slice uses rectangles or similarly simplified geometry, that slice must be documented as diagnostic, provisional, or exploratory unless the project intentionally commits to that shape grammar.

## Evolving Process Rule

The process is not assumed to be final or perfect.

We should expect:

- process injections
- new techniques
- replacement heuristics
- new refinement stages
- new validation stages
- reordered or split stages when the pipeline improves

Because of that, each process step must be self-contained enough to be understood, replaced, inserted, removed, or reordered without requiring a full rewrite of unrelated stages.

Pipeline evolution is normal in this app. Architecture should support that reality instead of resisting it.

## File Size Rule

There is no hard numeric cap yet, but large files are treated as a design smell.

Expected direction:

- Components should stay focused on one screen area or one interaction surface.
- Services should have one primary responsibility.
- Utility files should group one coherent domain, not become a dumping ground.
- When logic becomes hard to explain quickly, it should probably be extracted.

## Copy-Paste Rule

Copying from the legacy app should be rare and deliberate.

Allowed:

- Small targeted snippets during migration
- Constants or formulas that are still valid
- Temporary reference-driven ports when immediately refactored into the new structure

Not allowed:

- Moving large legacy blocks into the new app unchanged
- Recreating old architecture under a new folder name

## Documentation Rule

Every meaningful architecture decision in `app-next` should be reflected in docs as the rebuild progresses.

Minimum expected docs:

- This architecture rules file
- A running rebuild roadmap for `app-next`
- Feature-path notes as slices are completed
- The AI step guide for future rebuild continuation

Future agents should be able to answer "where does this belong?" from the docs before reading large amounts of code.

## Local Block Documentation Rule

Strong documentation is required at the block location itself for non-trivial logic.

For any meaningful block, the nearby documentation should make clear:

- what data the block receives or reads
- what data it produces or mutates
- what its responsibility is
- what it does not own
- any important invariants or assumptions

For procedural-generation blocks, also document:

- whether the block is generation, refinement, validation, projection, or presentation
- whether it transforms canonical data or only derived display data
- whether it is deterministic, seed-driven, or state-driven
- what stage inputs must already be valid before this block runs
- what outputs the block is expected to produce for the next stage

Do not rely on one giant file header to explain everything below it. Documentation should stay near the logic it describes.

For process-step blocks, input and output expectations are mandatory, not optional.

If a future agent cannot tell what a step expects in and what it promises out, the block is under-documented.

## Encapsulation Rule

Encapsulation is a hard rule in `app-next`.

- State should be owned by the smallest reasonable module.
- Features should not reach into each other's internals.
- Helper logic should not depend on wide shared mutable state when explicit inputs can be passed instead.
- Prefer passing typed data into a function over having the function read from unrelated shared fields.
- Avoid "god services" and "god components" that become the default owner of cross-feature state.

If a method requires unrelated global context to work, treat that as a design warning and refactor.

## Access Control Rule

Be deliberate with access modifiers and exported surface area.

- Default to `private` unless a member must be accessed outside the class.
- Use `protected` only when there is a real inheritance-based need.
- Use `public` intentionally for true component/service API surface.
- Export only what is needed outside the module.
- Keep constants, helpers, and derived values scoped as narrowly as possible.

Do not leave variables or methods broadly accessible "just in case".

## Variable Naming Rule

Naming must reduce ambiguity, not add to it.

- Prefer explicit domain names over short generic names.
- Name data for what it represents, not for where it came from.
- Avoid vague names like `data`, `item`, `stuff`, `temp`, `value`, or `obj` unless the scope is extremely small and obvious.
- Use names that distinguish source data, derived data, UI state, and persisted state.
- Keep related terms consistent across a feature path.

If two variables can be confused when read quickly, rename them.

For this rebuild, prefer names that reveal visible behavior over infrastructure jargon when the value is shown to users or used in handoff docs.

Examples:

- prefer `layoutId` over generic capture ids when the thing being identified is a layout
- prefer `core` over `instance` when the concept is one isolated running exploration unit
- prefer `layout exploration` over generic `simulation` when referring to the whole current stage

## Shared Data Rule

The new app must avoid the legacy pattern where many steps and methods quietly depend on the same shared data or helper stack.

- A step should declare its inputs clearly.
- A method should not depend on hidden side effects from distant setup code.
- Shared helpers should stay narrow and domain-specific.
- Cross-step data flow should be explicit in typed contracts.
- If several steps use the same mutable object, that ownership must be obvious and justified.

Passing everything through one shared state bucket is not acceptable architecture for `app-next`.

## Self-Contained Step Rule

Each process step should be designed as a self-contained unit of pipeline work.

A step should make clear:

- what upstream stage it depends on
- what input contract it accepts
- what transformation or check it performs
- what output contract it returns
- what state, if any, it is allowed to mutate

Prefer steps that can be reasoned about in isolation.

Avoid steps that only work because of hidden ordering assumptions, ambient state, or undocumented side effects from distant helpers.

Every self-contained step should carry a small block comment or nearby doc note stating:

- Step number or slice number
- Stage category
- Input contract
- Output contract
- Allowed dependencies
- Explicitly forbidden responsibilities

For downstream processing and refinement work, prefer one dedicated service per real step/process rather than one broad processing service with internal branches.

That rule exists because future pipeline work may need:

- alternate step orderings
- step injection
- per-step argument overrides
- experimental branch variants

Those futures are only practical if each step is already isolated behind a strict input/output boundary.

## Self-Testing Rule

`app-next` must support self-testing as part of the product architecture.

Self-testing here means the app should be able to produce inspectable evidence of what the pipeline did, not only whether it "passed" or "failed".

Expected direction:

- stage-level checks for important pipeline outputs
- validation reports tied to concrete generated outputs
- historical logging that allows outputs to be inspected later
- reproducible enough records that a bad output can be traced back through its pipeline stages

Testing signals should not stop at aggregate counters or summary stats when richer process evidence is available.

Testing must also be iterative during the rebuild itself.

As blocks are moved or rebuilt:

- test the moved block in its new location
- verify that its documented inputs and outputs still match reality
- verify that any reporting connected to that block still emits usable inspection data

Do not defer testing until large groups of blocks have accumulated.

## Reporting And History Rule

The app must log to an endpoint using structured reporting.

Reporting should include more than headline statistics. It should capture the content the process had at meaningful stages so historical inspection is possible.

At minimum, reporting design should support:

- output identity
- run identity
- stage identity
- timestamps
- source or input references
- key intermediate artifacts
- validation findings
- final geometry or output snapshots

The goal is to be able to inspect the historical progress of each output, not just its final score.

If an output fails, succeeds, mutates, or is promoted, the reporting model should make that history reconstructable.

Reporting should begin as early as practical in the rebuild, not wait for the full pipeline to exist.

The preferred early starting point is:

- when candidate layouts are being simulated or captured
- when a layout is passed, promoted, or otherwise accepted as a meaningful result

That early reporting baseline matters more than waiting for a "complete" reporting system later.

## Endpoint Reporting Rule

Endpoint logging should use explicit payloads with stable structure.

- Prefer typed report models over ad hoc blobs.
- Keep report kinds separated by purpose when that improves inspection.
- Include enough content to understand what the process stage saw and produced.
- Do not log only percentages and counts if the underlying geometry, constraints, or stage artifacts are needed for diagnosis.

For the earliest implementation, prioritize report payloads around:

- simulation candidate capture
- simulation candidate rejection or reset when useful
- layout pass / promotion events
- canonical geometry snapshots attached to accepted outputs

Summary stats are allowed, but they are not sufficient by themselves.

## Visual Accuracy Rule

Visuals must preserve data truth as much as possible.

- Prefer a single canonical data representation for geometry and metrics.
- Do not maintain separate "visual truth" and "data truth" unless there is a clear technical need.
- Visual artifacts should be derived from processed data, not authored independently from it.
- Display metrics, labels, extents, and overlays should be computed from the same canonical results used by validation and export whenever possible.

If a visual must diverge from canonical data for usability, that divergence should be small, explicit, and documented.

## Lightweight Visual Rule

Visuals should stay light and operationally cheap.

This app is expected to spend meaningful resources on procedural generation, refinement, validation, and reporting. The visual layer should not add unnecessary rendering cost.

Preferred direction:

- clean surfaces
- minimal decoration
- minimal animation
- minimal emphasis effects
- low-overhead rendering choices

Avoid:

- heavy highlight systems
- fancy fading treatments
- unnecessary motion
- layered decorative effects that do not improve inspection value

## At-A-Glance Analysis Rule

Visual design should support quick inspection first.

- Keep colors when they carry domain meaning.
- Keep labels when they are readable and useful.
- Prefer clarity over visual flair.
- Use contrast and spacing to make layout state readable at a glance.
- Do not remove useful semantic encoding just to make the UI more minimal.

The goal is operational readability, not visual ornament.

## Visual Extraction Rule

Visual preparation should happen after the relevant data-processing stage has completed.

Preferred order:

1. source loading
2. domain transformation
3. generation
4. refinement
5. validation
6. visual projection
7. rendering/presentation

This means:

- avoid mixing rendering preparation into core generation logic
- avoid mutating generation data just to make drawing easier
- extract view models, screen coordinates, SVG points, colors, and overlays from already-processed stage outputs

In short: compute first, visualize second.

## Graphics Terminology Rule

Use technically correct graphics language when documenting visual code.

Preferred distinctions:

- `geometry` for canonical shapes, points, edges, polygons, cells, and paths
- `projection` for mapping world or model coordinates into screen space
- `rasterization` or `rendering` for turning projected shapes into drawn output
- `presentation` for UI composition, layout, labels, and interaction chrome
- `view model` for data already prepared for display

Avoid collapsing all of these into generic words like "draw", "display data", or "visual stuff" when a more precise term exists.

## Default Decision Rule

When choosing between speed and structure for `app-next`, choose structure if the speed gain would push the app back toward monolithic behavior.

## Initial Folder Intention

The current planned root is:

- `apps/planforge`

Expected structure will evolve, but should likely separate:

- `src/app/shell`
- `src/app/features`
- `src/app/core`
- `src/app/shared`
- `docs`

This structure is a starting point, not a prison. The non-monolith rule matters more than strict folder orthodoxy.

