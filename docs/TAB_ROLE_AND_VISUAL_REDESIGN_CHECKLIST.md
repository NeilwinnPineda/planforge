# Tab Role And Visual Redesign Checklist

## Purpose

This checklist defines what each main `planforge` route is for, how it should be represented, and what cleanup work is needed to make the UI match the stage role.

This exists to stop random per-page UI drift.

If a route does not have a clear stage role, representation style, dominant surface, and next decision, redesign work will keep feeling arbitrary.

## Basis For This Checklist

Current scan basis on 2026-07-02:

- source scan of current feature routes and shell
- current route and interaction coverage in `e2e/app-shell.spec.ts`
- local build and lazy-route validation
- live serve review of the route shell and workflow navigation

This checklist should be treated as the current design contract until replaced by a more formal route UX specification.

## Progress Snapshot

Current cleanup status on 2026-07-03:

- `Done`: workflow shell redesign from generic tabs to route-driven stepper
- `Done`: novice-first and layout-first checklist definition
- `Done`: Program Setup route cleanup
- `Done`: Site And Lot route cleanup
- `Done`: Simulation route layout-first redesign
- `Done`: Processing route layout-first redesign
- `Done`: Verification route layout-first redesign
- `Done`: Construction Output route redesign
- `Done`: Candidate Gallery route cleanup
- `Done`: Overview Run & Health extraction and route cleanup
- `Done`: Generation preview standardization
- `Done`: Reporting diagnostic-lane cleanup
- `Done`: shared layout-view, status, statistics, and empty-state primitives
- `Done`: duplicate output routes and route-local layout renderers removed

Status legend:

- `Done`: route cleanup pass implemented and validated
- `In progress`: active route cleanup pass underway
- `Next`: highest-priority next route
- `Queued`: planned after higher-priority routes
- `Optional`: useful later, but not on the critical path

## Global Rules

### Default User Assumption

Assume the default user:

- does not know the internal pipeline
- does not know the technical vocabulary
- does not care about implementation details first
- mostly wants to see the layout
- wants the app to explain whether the layout is good, bad, blocked, or ready

That means every route must be understandable to someone who is not trying to debug the system.

The UI should answer these questions in plain language before anything technical:

1. what am I looking at
2. why does this stage matter
3. where is the layout on this page
4. is the layout okay
5. what should I do next

### Layout First Rule

Whenever a route has a real layout, polygon, room arrangement, or construction preview available, that visual should appear before deep metrics or technical tables.

If the user mostly wants to see the layout, the route should not make them work to find it.

### Technical Detail Rule

Technical detail is allowed, but it must be secondary by default.

Technical detail includes:

- traces
- debug rows
- raw metrics tables
- pipeline step internals
- payload details
- secondary schedules that are not needed for the main decision

These should usually be:

- lower on the page
- behind a disclosure
- inside a subordinate panel
- visually quieter than the main surface

### Route Reading Order Rule

Each route should read in this order:

1. stage title and purpose
2. current status or verdict
3. main layout or main visual surface
4. the one or two most important supporting facts
5. deeper explanation
6. advanced or technical detail

If the route does not naturally read in this order, it will feel harder than it needs to.

Every route should define:

- one stage role
- one dominant primary surface
- one supporting inspection surface
- one visible stage status or readiness signal
- one clear next action or next route

Every route should avoid:

- equal visual weight on every panel
- leading with debug detail before stage purpose
- mixing editor, monitor, report, and gallery behaviors into one flat layout
- repeating the same summary content in too many places

### Shared Visual Language Rule

Routes should not invent their own visual system anymore.

The app needs one shared panel language across all core routes so the user is not constantly re-learning the UI.

That means route pages should reuse the same family of visual behaviors for:

- hero header structure
- stage status pills
- highlight stat strips
- primary card surfaces
- secondary support panels
- metric rows
- pass/fail chips
- quiet disclosures for advanced detail

When a route needs to look different, that difference should come from stage role and content, not from a completely unrelated styling system.

The goal is:

- one product
- one visual language
- different stage-specific compositions

not:

- ten mini apps with unrelated panel styling

### Implied Direction Rule

Before adding more UI copy, use implied direction first.

Users should be able to understand the page mainly from:

- what is large
- what is first
- what is grouped together
- what is labeled clearly
- what looks primary
- what looks secondary
- what is obviously actionable

Explanatory text should help orientation, but it should not carry the whole interface.

Use:

- short headers
- one-sentence purpose lines
- direct button labels
- compact status language
- collapsible technical detail

Avoid:

- paragraph-heavy panel intros
- repeating instructions in multiple places
- verbose helper copy for things the layout already makes obvious
- adding more text instead of fixing hierarchy

If a route needs too much explanation, redesign the route before adding more words.

Minimal and intuitive beats verbose and space-consuming.

### Data Usefulness Rule

A route should not show data just because the app has that data.

Every visible panel, metric group, table, or note should belong to one of these layers:

1. decision layer
2. support layer
3. diagnostic layer

Decision layer:

- what the layout is
- whether it is good, bad, blocked, or ready
- what matters most right now
- what the next action is

Support layer:

- a small number of facts that explain the verdict
- comparison facts
- readiness checks
- compact stage-specific metrics

Diagnostic layer:

- traces
- full detail tables
- rule breakdowns
- raw internals
- per-step inspection data

Rules:

- decision layer must be visible first
- support layer must stay compact
- diagnostic layer should usually be collapsible
- if data does not help the user decide or act, hide it or remove it
- do not spend permanent screen space on data the user cannot use

This is especially important on Simulation, Processing, Verification, Construction Output, and Reporting where internal system data can easily overwhelm the stage purpose.

## Route Checklist

### 1. Overview

Progress status:

- `Done`

Role:

- orient the user to the app mission and workflow

Target representation:

- executive overview

Dominant surface:

- workflow summary and current system posture

Supporting surfaces:

- current source identity
- simulation status
- current rebuild/product status

What the user should understand in 10 seconds:

- what this app does
- what the next stage is
- whether the app is ready to use right now

What should be shown first:

- the workflow story
- current project/source identity
- current system status

What should be de-emphasized:

- rebuild-history wording
- internal roadmap language
- too much static prose

Needs cleanup:

- reduce generic intro copy
- present stronger app-state snapshot instead of mostly static explanation
- show route-to-route workflow meaning more explicitly
- surface current risks or readiness in one compact block

### 2. Program Setup

Progress status:

- `Done`

Role:

- define the design brief

Target representation:

- structured editor

Dominant surface:

- editable room/program table and adjacency controls

Supporting surfaces:

- source import/export state
- priorities
- validation messages
- optional raw/reference details

What the user should understand in 10 seconds:

- what rooms are in the project
- how many there are
- whether the source looks valid enough to continue

What should be shown first:

- editable program room list
- room counts
- a brief validation/readiness summary

What should be de-emphasized:

- raw reference data
- low-priority source details
- any matrix detail that is not needed immediately

User-first design note:

- the page should feel like "set up the house brief"
- not like "edit a configuration schema"

Needs cleanup:

- make one editor surface clearly primary
- compress lower-priority reference material behind disclosure or tabs within the page
- improve visual separation between editable program data and reference-only data
- show stronger "brief health" summary at the top
- make next-stage impact clearer:
  - what changes here affect generation and simulation

Implemented in current pass:

- added plain-language stage summary, status, and next action
- made brief health visible before deep reference material
- kept the editable room program as the dominant primary work surface
- preserved validation notes as a visible secondary review block
- pushed project brief and supporting source facts into a quieter sticky sidebar

### 3. Site And Lot

Progress status:

- `Done`

Role:

- define physical constraints and buildable context

Target representation:

- geometry editor plus diagnostics

Dominant surface:

- large polygon/buildable preview

Supporting surfaces:

- survey segment editor
- setback schedule
- world-space point viewer
- geometry issue list

What the user should understand in 10 seconds:

- what the lot looks like
- where the buildable area is
- whether the lot is usable or needs correction

What should be shown first:

- the lot/buildable preview
- a simple status:
  - ready
  - review
  - fail

What should be de-emphasized:

- raw point lists
- low-level coordinate inspection
- secondary geometry details unless the lot has a problem

User-first design note:

- this page should feel like "show me the site"
- not "show me a geometry workbook"

Needs cleanup:

- make the preview the undisputed visual anchor
- group editing controls into one cohesive editor panel
- reduce fragmentation between segment editing and boundary schedule views
- strengthen readiness language:
  - ready
  - review
  - fail
- make fail and review states more visually obvious without turning the page into an alert wall

Implemented in current pass:

- added plain-language stage summary, status, and next action
- made the lot/buildable preview the clear first visual anchor
- added a direct geometry verdict block so readiness is visible before deeper editing
- kept the segment builder and boundary schedule as the main editable surfaces
- demoted the world-space coordinate viewer into a quieter secondary disclosure

### 4. Generation

Progress status:

- `Done`

Role:

- show deterministic seed derivation before live simulation

Target representation:

- preview inspector

Dominant surface:

- seed layout preview

Supporting surfaces:

- seed schedule
- stage facts
- generation metrics

What the user should understand in 10 seconds:

- where the rooms are initially being placed
- whether the starting arrangement looks reasonable

What should be shown first:

- the generation preview
- the count of active rooms and seed points

What should be de-emphasized:

- seed math
- ordering logic
- low-level derivation detail

User-first design note:

- the page should answer:
  - "before the simulation starts, does this initial layout look sane?"

Needs cleanup:

- make the page feel more like a transition from brief/geometry into simulation
- emphasize generated spatial intent instead of just listing seeds
- tighten the metrics into a concise summary strip
- improve legibility of seed identities and ordering
- make the page answer one practical question:
  - does the initial deterministic setup make sense before simulation runs

### 5. Simulation

Progress status:

- `Done`

Role:

- operate and inspect live layout exploration

Target representation:

- live engine console

Dominant surface:

- simulation canvas and active instance state

Supporting surfaces:

- control bar
- parallel simulation summary
- room/bubble inspection
- SAT summaries
- capture feed

What the user should understand in 10 seconds:

- where the current layout is
- whether the system is running
- whether layouts are improving, failing, or being captured

What should be shown first:

- the live layout view
- the current active simulation state
- a simple pass/fail/progress summary

What should be de-emphasized:

- SAT detail tables
- low-level bubble data
- detailed technical metrics until the user asks for them

User-first design note:

- this page should feel like:
  - "watch the layout evolve"
- not:
  - "study a wall of simulation telemetry"

Needs cleanup:

- keep the canvas and active-instance understanding central
- avoid spreading operational state evenly across too many similarly weighted panels
- improve distinction between:
  - global system state
  - active instance state
  - recent capture outcomes
- make "why this run passed or failed" faster to scan
- compress secondary technical tables until the user asks for them

Implemented in current pass:

- added plain-language stage summary, status, and next action
- made the live layout the dominant visual surface
- moved deeper telemetry into `Advanced diagnostics`
- preserved simulation health, gallery, and technical inspection data in secondary positions

### 6. Processing

Progress status:

- `Done`

Role:

- inspect how a captured layout transforms through downstream stages

Target representation:

- pipeline inspector

Dominant surface:

- ordered processing step panels with per-step preview

Supporting surfaces:

- pipeline overview metrics
- hallway/trace rows
- stage-specific detail metrics

What the user should understand in 10 seconds:

- how the layout changed after capture
- whether the shape is becoming cleaner and more usable

What should be shown first:

- the before/after or step-by-step layout previews
- the currently focused step and its effect

What should be de-emphasized:

- raw traces
- every step detail being open at once
- metrics without visual context

User-first design note:

- this page should feel like:
  - "show me how the rough layout is being cleaned up"
- not:
  - "show me a transformation stack dump"

Needs cleanup:

- improve step hierarchy so the user can quickly tell:
  - what changed
  - why it changed
  - whether the step helped
- reduce visual overload from too many equally expanded step details
- consider accordion or timeline behavior for step focus
- move remaining preview/projection shaping into service-owned view-model helpers
- make final "handoff to verification" state more obvious

Implemented in current pass:

- added plain-language stage summary, status, and next action
- made the final processed layout the dominant first surface
- added a simple transformation journey from capture to final geometry
- demoted full step internals into collapsible step inspectors
- preserved contract, metric, and trace visibility without making them the first thing the user sees

### 7. Verification

Progress status:

- `Done`

Role:

- judge processed layouts and explain pass/fail outcomes

Target representation:

- diagnostic QA screen

Dominant surface:

- verified layout inspection with highlighted failures

Supporting surfaces:

- grouped check summaries
- failure detail lists
- buildable boundary context

What the user should understand in 10 seconds:

- whether this layout passed
- if it failed, what kind of failure happened
- where the problem is on the layout

What should be shown first:

- the verified layout preview
- the overall verdict
- clearly grouped failure categories

What should be de-emphasized:

- dense failure text before the visual
- secondary detail rows before the verdict

User-first design note:

- this page should feel like:
  - "is this layout acceptable?"
- not:
  - "inspect a verification report object"

Needs cleanup:

- make the failing conditions more visually grouped by severity
- ensure the inspected layout is the first thing the user understands
- strengthen the difference between pass summary and deep failure detail
- move remaining inspector projection shaping into a dedicated service
- clarify the practical question:
  - is this layout acceptable and if not why not

Implemented in current pass:

- added plain-language stage summary, status, and next action
- made the full verified layout with highlighted problem rooms the dominant first surface
- grouped failure categories into a simple “what is failing” section before deeper detail
- demoted per-check inspection panels and the cell table into collapsible detail sections
- preserved detailed QA visibility without forcing the user to start from the raw report shape

### 8. Construction Output

Progress status:

- `Done`

Role:

- stage verified layouts for downstream construction handoff

Target representation:

- handoff board

Dominant surface:

- construction preview with wall, door, and window overlays

Supporting surfaces:

- readiness checklist
- output metrics
- contract-facing facts

What the user should understand in 10 seconds:

- what the layout looks like as a construction-ready drawing
- whether it is ready to move downstream

What should be shown first:

- the construction preview
- wall, door, and window overlays
- one readiness summary

What should be de-emphasized:

- contract internals
- too many technical output facts at once

User-first design note:

- this page should feel like:
  - "show me the handoff version of the layout"
- not:
  - "show me export plumbing"

Needs cleanup:

- strengthen the page as a pre-export review surface instead of a generic preview
- clarify overlay toggles or visual distinction between walls, doors, and windows
- make "not yet ready for Revit mutation" explicit but calm
- move remaining preview and marker derivation into a dedicated preview service
- expose contract readiness in a single summary block

Implemented in current pass:

- added plain-language stage summary, status, and next action
- made the construction preview the first dominant review surface
- grouped readiness facts beside the main preview instead of scattering them
- moved deeper wall, window, door, and schedule details into quieter expandable sections
- preserved downstream handoff context without making export plumbing the first thing the user sees

### 9. Candidate Gallery

Progress status:

- `Done`

Role:

- compare accepted candidates and choose the strongest one

Target representation:

- comparison board

Dominant surface:

- candidate cards or ranked comparison rows

Supporting surfaces:

- key score factors
- mini previews
- selected candidate detail

What the user should understand in 10 seconds:

- what the main candidate options are
- which candidates are stronger or weaker
- which one is currently selected

What should be shown first:

- clear visual candidate comparison
- top-ranked or selected candidate emphasis

What should be de-emphasized:

- excessive card detail
- metrics that do not help selection
- duplicated information between cards and detail view

User-first design note:

- this page should feel like:
  - "help me choose the best layout"
- not:
  - "browse a bag of records"

Needs cleanup:

- improve comparative reading so differences are obvious at a glance
- standardize which score/check facts are always shown
- clarify whether the page is for browsing, ranking, or final selection
- reduce duplicated display logic with other output/gallery-style routes
- consider stronger selected-state treatment for the chosen candidate

Implemented in current pass:

- replaced the old isolated dark micro-style with the shared route panel language
- added the common stage summary, status, and next action header pattern
- turned the gallery into a comparison board with candidate lineup first and selected detail second
- made score, check, and construction facts read as support for selection instead of unrelated widgets
- aligned chips, cards, spacing, and panel treatment with the newer route redesign pattern

### 10. Reporting

Progress status:

- `Done`

Role:

- inspect reporting contracts and system event history

Target representation:

- operator log and contract inspector

Dominant surface:

- reporting history and payload summary

Supporting surfaces:

- self-test emission
- endpoint status
- report detail inspection

What the user should understand in 10 seconds:

- this is a system page
- it is not required to understand the layout workflow

What should be shown first:

- reporting history
- endpoint state
- self-test tools

What should be de-emphasized:

- pretending this is a product-facing design stage

User-first design note:

- this page can remain more technical than the others
- but it should still be clearly labeled as diagnostic infrastructure

Needs cleanup:

- keep this page intentionally diagnostic
- separate "emit test event" from "inspect history"
- improve readability of payload summaries
- make clear this is a system lane, not a product lane
- keep this route visually quieter than the core design workflow routes

## Cross-Route Cleanup Work

The highest-value route cleanup sequence is:

1. define a top-of-page stage header pattern shared by all main routes:
   - title
   - one-sentence purpose
   - stage status
   - next action
2. enforce one dominant primary surface per route
3. demote secondary diagnostics behind disclosures, accordions, or subordinate panels
4. extract remaining route-local preview and projection logic into service-owned view-model helpers
5. unify comparison card patterns across Gallery, Outputs, and related success-selection surfaces
6. add consistent route footers or next-step cues so each stage points forward
7. standardize panel styling so route differences come from role, not from unrelated visual systems

## Layout-First Todo List

To optimize the app for a user who mostly wants to see the layout:

1. ensure every layout-bearing route shows its main layout surface above the fold
2. reduce the amount of text the user must read before seeing geometry
3. add a simple plain-language status/verdict block near the main visual on each route
4. collapse or demote technical detail on Simulation, Processing, and Verification
5. make the active layout identity persistent and obvious across downstream routes
6. make Gallery and Construction Output stronger "decision" surfaces, not just inspection surfaces
7. use the same visual language for:
   - current stage status
   - pass/fail state
   - ready/not-ready state
8. standardize visual treatment for:
   - panel shells
   - metric strips
   - comparison cards
   - detail sidebars
   - quiet advanced sections
9. add route-level "what am I looking at" help text that is one sentence, not a paragraph
10. remove any panel that does not help the user either:
   - see the layout
   - judge the layout
   - move the layout forward

## Service Extraction Follow-Through

The remaining non-core service follow-through for route cleanup is mostly presentation/view-model extraction:

- `ProcessingPreviewService`
- `VerificationInspectorService`
- `ConstructionPreviewService`
- `LotGeometryPreviewService`
- optional shared gallery/output presenter helpers

These are not the same as core pipeline services.

They exist to keep route pages aligned with their visual role without re-owning projection and derived display logic.

## Immediate Todo Order

Recommended implementation order:

1. `Done` lock this checklist as the route design contract
2. `Done` refactor each route top section so purpose/status/next action are consistent
3. `Done` redesign the Simulation route around one clearly dominant live surface
4. `Done` redesign Processing into a more readable step-focused inspector
5. `Done` redesign Verification into a stronger pass/fail diagnostic review
6. `Done` redesign Construction Output as a clearer handoff board
7. `Done` redesign Program Setup and Site And Lot for cleaner editor-first layouts
8. `Done` clean up Gallery comparison behavior
9. `Done` standardize remaining route visuals and clean up Reporting
