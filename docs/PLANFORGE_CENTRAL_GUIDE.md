# Planforge Central Guide

## What This Is

This is the one-page working guide for `planforge`.

Use this first when you want the app direction without opening a pile of separate docs.

The other files in this folder still matter, but they should now act as detailed references instead of required first reads.

## App Mission

`planforge` is the standalone browser workspace for residential layout generation.

Its job is to help the user:

- set up a residential project source
- generate multiple layout candidates
- inspect and compare those candidates
- verify which layouts are acceptable
- prepare a typed downstream handoff for construction and Revit

It is not a Revit mutation surface.

## Core Product Direction

The app should feel like:

- a usable layout studio
- a decision-support workspace
- a preparation surface for downstream export

It should not feel like:

- a rebuild checkpoint tour
- a debug console first
- a disconnected pile of technical panels

## Workflow Spine

Treat the app as one continuous workflow:

1. source setup
2. lot and geometry setup
3. candidate generation
4. live simulation and capture
5. downstream processing
6. verification
7. candidate selection
8. construction-oriented output

Every route should help the user answer one practical question before moving forward.

## Current App Truth

The active app already has these real lanes:

- shell navigation and route workflow
- editable source/program setup
- lot/buildable geometry derivation
- simulation orchestration and capture
- processing pipeline services
- verification review
- gallery/ranking behavior
- construction output and typed contract plumbing

So the main job now is not proving the rebuild exists.

The main job now is making the app easier to use, easier to trust, and easier to hand off from.

## Ownership Boundary

`planforge` owns:

- browser workflow
- generator-side logic
- geometry, processing, and verification before Revit
- export contracts produced before Revit import
- app-local tests and E2E

`planforge` does not own:

- Revit thread routing
- Revit transactions
- Revit preview/apply mutation behavior
- arbitrary bridge execution

## The Five Big Rules

### 1. Keep A Strong Data Spine

Canonical data is the truth.

That means:

- world-space geometry is authoritative
- verification metrics should come from canonical outputs
- SVG strings, labels, and panel rows are derived display data
- one layout identity should persist from capture to verification to export

### 2. Do Not Rebuild A Monolith

Do not let one page, service, or file become the default home for everything.

Keep separate:

- shell
- route orchestration
- generation
- processing steps
- verification
- reporting
- view-model and projection logic
- presentation

Main pipeline execution belongs in services, not in route pages.

If a page starts owning a real processing chain, verification rerun, or construction-stage assembly, that is a service-boundary violation and should be extracted.

### 3. Treat The App As A Pipeline

Use pipeline thinking, not random-screen thinking.

Preferred language:

- source
- constraints
- generation
- refinement
- validation
- selection
- projection
- presentation

### 4. Make The Product Layer Clearer Than The Diagnostic Layer

Each route should lead with:

- what this stage is for
- current status
- what matters here
- what the next action is

Diagnostics should stay available, but should not be the first thing the user has to decode.

### 5. Keep Revit Handoff Typed And Safe

The app should export typed layout output.

It should never treat raw prompt output or arbitrary exec as the handoff model.

## UX And Naming Rules

Prefer product-facing names such as:

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

## Visual Rules In Plain English

The UI should feel:

- architectural
- calm
- precise
- readable

Use:

- warm neutral surfaces
- consistent panel framing
- restrained accent color
- stable status colors
- geometry-first readability

Avoid:

- generic SaaS dashboard look
- noisy debug-console presentation
- decorative color drift
- every panel looking identical

## Panel Rules In Plain English

Every major route should have:

- one dominant panel
- one clear stage purpose
- visible status/readiness
- supporting metrics
- optional deeper diagnostics

The ideal panel order is:

1. purpose
2. status
3. main visualization or comparison
4. supporting metrics
5. deeper technical detail

## Processing Rules In Plain English

Processing is not one step.

It is a chain of self-contained steps, each with explicit input and output.

The app should keep:

- one service per real processing step
- one orchestrator for step order
- one visible panel per declared step

Do not hide processing behavior inside page components or giant shared state.

## Terminology Rules In Plain English

Use these terms carefully:

- `generation`: create candidates
- `refinement`: reshape candidates
- `validation`: check against rules
- `selection`: choose among candidates
- `projection`: map world geometry to screen space
- `presentation`: show it in the UI

Also keep this distinction:

- canonical data: source of truth
- display data: derived for the UI

## Immediate Priorities

The most valuable near-term work is:

1. make route-to-route workflow feel more connected
2. improve candidate comparison and selection
3. make verification easier to act on
4. make construction/export readiness more obvious
5. keep test coverage moving with feature work

## If You Need More Detail

Use the detailed docs only when you need to zoom in:

- `PLANFORGE_PRODUCT_GUIDE.md`: goals, workflow UX, naming, visual direction, and panel rules
- `PLANFORGE_SYSTEM_GUIDE.md`: architecture, pipeline, terminology, processing, and testing rules
- `TAB_ROLE_AND_VISUAL_REDESIGN_CHECKLIST.md`: route-by-route role, representation style, and cleanup order
- `REBUILD_ROADMAP.md`: migration history and current pipeline status
- `AI_STEP_GUIDE.md`: continuation guidance for future implementation work
- the older topic-specific docs: lightweight redirects for anyone arriving from old links

## Bottom Line

If one sentence needs to guide work in this app, use this:

`planforge` should be a trustworthy browser studio that turns project setup into comparable, verifiable, and exportable residential layout decisions.
