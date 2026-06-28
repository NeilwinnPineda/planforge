# Procedural Generation And Visual Terminology

## Purpose

This guide exists so code and docs in `app-next` use technically correct language for the rebuild.

The app is a procedural generation pipeline with visual output. It is not just a UI around arbitrary calculations.

## Recommended Mental Model

Treat the system as a staged pipeline:

1. Source authoring
2. Typed loading
3. Constraint derivation
4. Candidate generation
5. Candidate refinement
6. Validation and scoring
7. Visual projection
8. Presentation

This ordering should show up in file structure, naming, comments, and function descriptions.

The pipeline should also be treated as evolvable.

It is expected that new steps, injected techniques, replacement heuristics, and re-ordered stages may be introduced as the generator improves. For that reason, each stage should be documented and implemented as a self-contained unit with explicit input and output expectations.

## Procedural Generation Terms

Use these terms deliberately:

- `generation`: creating new candidate content from rules, parameters, constraints, or seeds
- `refinement`: improving or reshaping generated output without changing the upstream brief
- `validation`: checking generated output against rules, constraints, and invariants
- `selection`: choosing among generated candidates using scores or gate conditions
- `projection`: converting canonical coordinates or geometry into display-space data
- `presentation`: arranging projected output for user viewing and interaction

Avoid using `generation` for every stage. Validation and projection are not generation.

## Canonical Data Versus Display Data

The preferred model is:

- canonical data is the truth
- display data is derived from canonical data

Examples:

- room geometry in world units is canonical
- SVG polygon strings are derived display data
- validation metrics are canonical analysis outputs
- chart labels and inspector rows are derived presentation outputs

If two versions of the same thing exist, the code should make clear which one is authoritative.

## Shape-Agnostic Early Geometry Guidance

Early-stage geometry should not prematurely collapse into a narrow room-shape assumption.

Preferred framing for unresolved early geometry:

- `spatial claims`
- `occupancy regions`
- `influence regions`
- `provisional polygons`
- `candidate cells`

Use more specific terms like `room rectangle`, `orthogonal footprint`, or `axis-aligned footprint` only when the stage truly means that exact geometry.

Do not let a temporary diagnostic approximation become the implied long-term geometry model in docs or code comments.

For this rebuild, irregular and non-orthogonal geometry should be treated as first-class possible outcomes, especially when responding to irregular lots, setbacks, and neighbor interactions.

## Visual Accuracy Guidance

Visuals should preserve structure and measured results from canonical data.

That means:

- do not hand-adjust geometry for appearance if it changes meaning
- do not compute one set of metrics for validation and another for display when both should agree
- do not create disconnected display-only geometry when the canonical geometry already exists

Prefer display code that reads and transforms canonical stage outputs.

Visual presentation should also stay lightweight.

- prefer simple rendering over decorative rendering
- avoid effects that add cost without improving interpretation
- preserve semantic color and readable labels when they improve at-a-glance analysis

In this app, visual restraint is a performance and clarity choice, not just a style preference.

## Graphics Method Terms

For this app, these terms are usually the most accurate:

- `geometry`: points, edges, segments, polygons, cells, paths
- `world space`: canonical coordinate system used by the generator
- `screen space`: display coordinate system used by the UI
- `projection`: world-to-screen conversion
- `render preparation`: deriving display primitives from validated outputs
- `rendering`: drawing those primitives into SVG, canvas, or DOM

For 2D SVG-oriented work, avoid pretending every visual step is "rendering pipeline" work in the GPU sense. But do keep the stage distinction clear: compute geometry first, then project, then render.

## Function Description Guide

When describing a non-trivial function, prefer this pattern:

- stage role: what part of the pipeline this belongs to
- inputs: what canonical or derived data it consumes
- operation: what transformation or check it performs
- outputs: what it returns or mutates
- ownership boundary: what it does not control

For pipeline-step blocks, the input and output description should be explicit enough that the step could be replaced or re-ordered without guesswork.

Example style:

- "Projects validated room polygons from world space into screen space for SVG presentation."
- "Derives adjacency constraints from the source brief before candidate generation begins."
- "Validates generated hallway cells against minimum-area rules and returns filtered canonical geometry."
- "Consumes candidate room polygons and emits refined polygon geometry for the next refinement stage."

Avoid vague descriptions like:

- "handles visuals"
- "processes data"
- "updates rooms"

Also avoid overclaiming shape resolution too early.

Examples:

- Prefer "derives provisional occupancy polygons from candidate seeds"
- Prefer "builds diagnostic spatial claims for containment inspection"
- Avoid "generates final room footprints" unless the stage actually resolves room shape semantics

## Procedural Generation Methods Relevant To This Project

The current legacy app already reflects several common procedural-generation ideas:

- rule-based generation
- constraint-driven generation
- iterative refinement
- candidate scoring and selection
- validation-gated promotion

Future rebuild work should continue using correct terms for those patterns instead of flattening them into generic application logic.

## Current Simulation Force Terms

At the current rebuild checkpoint, the simulation stage in `app-next` already uses several distinct force families.

These should be described precisely in code comments and handoff notes:

- `collision push`: overlap-separation force that preserves bubble radius and now includes penetration-weighted response
- `centroid-amplified collision push`: stronger collision separation when overlap happens nearer the buildable centroid
- `matrix attraction`: pairwise pull derived from adjacency scores `4`, `5`, and `6`
- `matrix repulsion`: pairwise separation derived from adjacency scores `1` and `2`
- `frontage pull`: weak-to-moderate edge attraction for `front_facing` rooms toward the RROW/buildable front edge
- `hallway-to-sleeping pull`: special circulation relationship that pulls hallway artifacts toward sleeping spaces when hallway bubbles exist
- `filler edge pull`: buildable-edge attraction for generated filler support bubbles
- `vista edge pull`: weak buildable-edge attraction for `vista` rooms that prefer boundary proximity without being frontage-bound
- `shake impulse`: temporary velocity injection used to disturb a stuck simulation state
- `boundary fallback and bounce`: containment-preserving response when a bubble attempts to leave the buildable polygon

At this checkpoint, room area or effective mass also influences response strength.

That means force application is no longer purely relationship-based. It is now relationship-based and inertia-weighted.

Larger rooms should be described as heavier responders, not just larger circles.

## Current Checkpoint Naming

For the current simulation checkpoint, these terms are accurate:

- `candidate seeding`: initial placement intent before live physics
- `layout exploration`: the current user-facing stage containing live candidate motion, evaluation, capture, and comparison
- `simulation`: the internal live bubble-motion mechanism under collision, matrix, and edge forces
- `capture gating`: pass/fail decision logic after simulation evolution
- `capture report`: structured accepted-candidate output sent to the reporting endpoint
- `inspection metrics`: derived analysis rows used to understand the current simulation state
- `core`: one isolated live simulator owned by the exploration orchestrator
- `layoutId`: the canonical visible identity for a captured or gallery-listed layout

Use this distinction deliberately:

- say `Layout Exploration` when referring to the stage in the product flow
- say `simulation` when referring to the mechanism inside that stage
- say `core` when referring to one isolated running exploration engine
- say `layoutId` when identifying a captured layout across gallery, reporting, and downstream stages

Avoid abstract user-facing labels such as:

- `instance`
- `engine instance`
- `sim instance`

Those may still exist in internal code during migration, but they should not be treated as preferred product-facing terminology.

Do not describe the current checkpoint as:

- final room geometry
- final room footprints
- final circulation solution
- final schematic layout

Those belong to downstream stages that are still legacy-bound.

## Sources Consulted

This guide was informed by:

- procedural content generation survey/textbook style terminology
- procedural generation research describing staged generation, control, validation, and evaluation
- graphics pipeline terminology distinguishing application, geometry, and rasterization stages

When updating this guide later, prefer primary or academically grounded references over blog-level shorthand.
