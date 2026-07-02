# Actual Test Scenario Pack

## Purpose

This file prepares the first real source-and-lot test wave for `planforge`.

The goal is not just to see whether the app renders.

The goal is to check whether the workflow still behaves across clearly different real inputs, including one intentionally impossible brief.

Implementation source:

- reusable scenario builders live in `e2e/source-scenario-pack.ts`

## Scenario Set

### 1. Compact Urban Infill

Intent:

- tight but feasible
- narrow frontage
- small but realistic single-storey brief

What it should stress:

- compact layout packing
- frontage behavior
- whether the app stays readable on a constrained lot

Expected posture:

- should still be feasible
- may require tighter simulation and processing behavior

### 2. Wide Family Lot

Intent:

- broader lot
- larger family-oriented room mix
- more public/shared rooms

What it should stress:

- room distribution across width
- secondary room handling
- whether the app preserves hierarchy between public and private spaces

Expected posture:

- should be feasible
- should produce a richer candidate set

### 3. Deep Narrow Lot

Intent:

- strong depth
- restricted width
- circulation-sensitive layout

What it should stress:

- hallway behavior
- sequencing from front to back
- access logic

Expected posture:

- may create harder circulation patterns
- should remain a useful stress case for Simulation and Processing

### 4. Irregular Corner Lot

Intent:

- non-rectangular lot
- five-point skewed geometry
- more survey-like boundary complexity

What it should stress:

- geometry interpretation
- buildable envelope review
- whether previews and downstream processing remain stable on awkward footprints

Expected posture:

- should remain feasible
- geometry review should become more important than on the default lot

### 5. Impossible Overcapacity Brief

Intent:

- room demand should exceed realistic available space
- known failure case

What it should stress:

- whether the app fails visibly instead of pretending success
- whether Simulation, Processing, Verification, and Construction keep useful state instead of collapsing into nonsense
- whether diagnostics stay understandable when the brief is fundamentally too large

Expected posture:

- should not cleanly succeed
- should surface obvious review, fail, blockage, or low-quality downstream results
- should be used as a required failure-behavior test

### 6. Super Hard

Intent:

- deliberately brutal combined stress case
- irregular narrow-front geometry
- overloaded multi-room brief
- high circulation and packing pressure

What it should stress:

- geometry interpretation under skewed multi-edge lots
- buildable-envelope pressure with both frontage and depth constraints
- hallway and filler behavior under extreme contention
- whether the app stays readable when multiple stages are under stress at once

Expected posture:

- may fail, degrade, or produce low-quality intermediate candidates
- should still provide meaningful diagnostics and visible state
- should be treated as a full-pipeline torture test, not a normal success benchmark

## What To Check During Real Runs

For each scenario:

1. import works
2. Program Setup still reads clearly
3. Site And Lot reflects the right lot shape and readiness
4. Generation produces a believable seed state for the brief
5. Simulation remains understandable and does not collapse into unreadable telemetry
6. Processing shows step panels and pending/implemented states correctly
7. Verification explains pass/fail cleanly
8. Construction Output only promotes what actually deserves handoff
9. output identity remains stable across downstream stages

## Required Comparison Notes

During the real wave, capture notes for each scenario on:

- source size and room count
- lot shape and buildable pressure
- whether Simulation became noisy or stayed useful
- whether Processing stayed visible and understandable
- whether Verification clearly explained problems
- whether Construction Output represented a real handoff candidate or only a blocked preview

## Latest Experiment Result

Date:

- 2026-07-02

Scenario:

- Wide Family Lot

Observed result:

- the run produced a usable exported contract, but the final output still leaks intermediate pipeline state instead of reading like a normalized final house contract
- interior-wall carry-through is not reliable in the final handoff view even though the upstream processing/construction path already knows more than the export currently preserves
- hallway geometry is still arriving in fragmented pieces, including multiple `generated_hallway_residual_*` artifacts and partially merged hallway segments
- filler artifacts and hallway artifacts are still named by pipeline provenance instead of being collapsed into final semantic categories
- UV-driven downstream steps likely still treat aspect ratio too loosely, which can distort world-space decisions before residual absorption and hallway merge

What this experiment changed:

- the first bug-fix pass should target final-contract normalization rather than isolated viewer cleanup
- this is one clustered problem: the export is still exposing generation history, geometry fragments, and incomplete carry-through instead of resolved final geometry

First bug-fix focus:

- preserve interior-wall data through the final contract instead of losing it after earlier stages
- normalize `generated_hallway`, `generated_hallway_residual`, `generated_filler`, and `generated_filler_residual` into clean final categories
- fix hallway merge behavior as part of final geometry cleanup, not as a separate cosmetic patch
- correct UV/aspect-ratio handling before residual splitting, hallway generation, and merge decisions

## Important Rule

The impossible scenario is not a bug by itself.

If it fails clearly and intelligently, that is a successful test outcome.

The bug would be:

- false success
- blank downstream pages
- silent failure
- misleading construction/export readiness
