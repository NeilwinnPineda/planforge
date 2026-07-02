# Planforge Product Guide

## Purpose

This guide centralizes the product-facing direction for `planforge`.

Use it for:

- app goals
- workflow expectations
- UI naming
- product voice
- visual direction
- panel and route presentation

## Product Mission

`planforge` is the standalone browser workspace for residential layout generation.

It should help a user:

1. shape the project source
2. generate layout options
3. inspect and compare those options
4. verify what is acceptable
5. carry a selected layout toward downstream export

The app should feel like a real design workspace, not a rebuild diary.

## Product Position

`planforge` should present itself as:

- a residential layout generator
- a layout inspection and comparison workspace
- a preparation surface for construction-oriented handoff

It should not present itself mainly as:

- an internal rebuild lab
- a debug console
- a stack of disconnected technical checkpoints

## Product Goals

### Goal 1: One Continuous Workflow

The app should feel like one connected studio from setup to export.

Targets:

- each route answers one clear decision question
- stage transitions preserve context
- selected layouts remain visible across downstream stages
- next actions are obvious
- export readiness is visible

### Goal 2: Strong Project Setup

Source and room-program setup should be trustworthy enough to act as the real beginning of the project.

Targets:

- source JSON is easy to inspect, import, export, and validate
- room-program editing is clear and lightweight
- adjacency editing expresses design intent without overload
- assumptions and validation notes are visible early

### Goal 3: Better Candidate Comparison

The app should help users choose, not just watch simulations.

Targets:

- candidates carry traceable provenance
- strengths and weaknesses are visible
- comparison surfaces emphasize tradeoffs
- gallery behavior supports promotion and selection

### Goal 4: Actionable Verification

Verification should explain what passed, what failed, and what blocks promotion.

Targets:

- verdicts are easy to scan
- failure categories map to design decisions
- room-level issues are visible in both visuals and detail tables
- accepted layouts clearly become downstream candidates

### Goal 5: Trustworthy Handoff

Construction output should communicate whether a layout is actually ready to leave the app.

Targets:

- one layout identity persists from verification to export
- walls, windows, and doors remain inspectable
- generated filler and hallway cells remain distinct from real rooms
- export readiness is product-visible, not only technically implied

## Workflow Language

Prefer user-facing route and stage names such as:

- Project Setup
- Site And Lot
- Generation
- Simulation
- Processing
- Verification
- Candidate Gallery
- Construction Output

Avoid leading with internal terms such as:

- slice
- checkpoint
- baseline
- rebuild
- app-next

Those terms may still exist in technical docs, but they should not dominate the product UI.

## Content And Tone

The app voice should be:

- clear
- calm
- direct
- competent
- product-oriented

Text should help the user answer:

1. where am I in the workflow
2. what is this stage for
3. what happened here
4. what should I do next
5. is this ready to move forward

Summary text should describe user value first, not only implementation details.

Buttons should describe intent, not machinery.

Prefer:

- Run Generation
- Compare Candidates
- Promote To Verification
- Export Construction Contract
- Send To Revit

Avoid:

- Execute
- Emit
- Trigger
- Baseline

## Status Language

Statuses should communicate readiness and decision state.

Preferred families:

- Not started
- In progress
- Ready for review
- Needs attention
- Verified
- Ready for export

Avoid developer-only state words when the UI is user-facing.

## Visual Direction

The interface should feel:

- architectural
- grounded
- restrained
- precise
- readable

Use:

- warm neutral surfaces
- measured borders
- restrained accent use
- stable semantic status colors
- strong geometry readability

Avoid:

- generic SaaS dashboard styling
- neon or debug-lab aesthetics
- decorative color drift
- every surface looking like the same card

## Visual System Rules

### Color

Color should be role-based first.

Recommended roles:

- neutral structural surfaces
- active/focus accent
- green for accepted/ready
- amber for caution/review
- red for blocked/failure
- stable room and cell colors for spatial reading

### Hierarchy

The app should maintain clear surface levels:

1. page background
2. shell containers
3. standard panels
4. inset technical areas

### Typography

Typography should support:

- route orientation
- stage hierarchy
- metric readability
- calm dense reading

### Controls

Controls should feel like one system across routes.

At minimum, keep these consistent:

- height
- radius
- border treatment
- focus treatment
- typography weight

## Panel Presentation Rules

Every route should have one dominant panel that answers:

- what is the main thing to inspect here

Preferred panel order:

1. stage purpose
2. current status or readiness
3. primary visualization or comparison
4. supporting metrics
5. deeper diagnostics

Panels should each do one main job:

- explain a stage
- summarize status
- compare candidates
- visualize geometry
- expose diagnostics
- expose actions

Do not make one panel try to do all of them at once.

## Implied Direction Rule

The UI should use implied direction first.

That means users should usually understand what to look at, what matters, and what to do next from:

- layout order
- panel hierarchy
- labels
- grouping
- button naming
- status treatment
- visual emphasis

before they need explanatory copy.

Instructional text is allowed, but it should be the backup layer, not the primary navigation system.

Prefer:

- one short orienting sentence
- obvious panel titles
- clear primary actions
- visual grouping that explains relationships
- progressive disclosure for advanced detail

Avoid:

- long helper paragraphs above the main content
- repeating the same explanation across multiple panels
- verbose labels that explain what the layout itself already makes obvious
- using copy to compensate for weak hierarchy or weak interaction design

Minimal, intuitive UI is usually cleaner, faster to scan, and more effective than verbose UI.

If a screen needs too much explanation, redesign the screen before adding more words.

## Comparison Surfaces

Comparison content should lead with:

- score summary
- strengths
- weaknesses
- blockers
- readiness for the next step
- selected state

Do not make raw metric dumps the primary comparison experience.

## Diagnostic Disclosure

Diagnostics should be available but visually secondary.

Preferred order:

1. product summary
2. readiness signal
3. user action
4. expandable technical detail

## Data Triage Rule

Every page must justify the data it shows.

Before adding a panel, metric, table, or note, ask:

1. what decision does this help the user make
2. what action does this help the user take
3. would the page still work better if this were hidden by default

If the answer is "none", the data should not be primary UI.

Use this order:

1. decision data
2. supporting data
3. optional diagnostic data
4. hidden or removed debug data

Decision data means:

- the main layout or visual
- the current verdict or status
- the one or two facts that explain what matters
- the next meaningful action

Supporting data means:

- compact metrics that help explain the verdict
- comparison facts
- readiness checks
- small tables that directly support the stage purpose

Optional diagnostic data means:

- per-step traces
- raw rule results
- detailed schedules
- inspector tables
- low-level internals for review or debugging

Hidden or removed debug data means:

- anything the user cannot act on
- duplicate summaries
- internal IDs without user value
- telemetry that explains the system more than the layout
- explanatory notes for controls that are already intuitive

The goal is not to show all available data.

The goal is to show the smallest useful set of data that helps the user understand the page and move forward.

## Table And Schedule Direction

Structured editing surfaces should behave like intentional technical tables.

They should support:

- row scanning
- column comparison
- stable inline control alignment
- low-friction edits

This matters especially for:

- room program editing
- adjacency schedules
- lot and boundary schedules
- construction schedules

## Empty State Direction

Every important panel should explain:

- why nothing is shown
- what prerequisite is missing
- what the next useful action is

Avoid generic empty shells.

## Immediate Product Priorities

The best near-term product work is:

1. improve route-to-route continuity
2. make candidate comparison more intentional
3. make verification easier to act on
4. make construction/export readiness more obvious
5. reduce internal rebuild language in the UI

## Success Standard

The product layer is working when the app feels like:

- a tool for making layout decisions

and not like:

- a guided tour of implementation checkpoints
