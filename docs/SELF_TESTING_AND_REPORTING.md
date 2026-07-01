# Self Testing And Reporting

## Purpose

This document defines the self-testing and reporting expectations for `app-next`.

The app is a procedural generation system. Because the process is iterative and imperfect, the system must record enough process evidence to support inspection, debugging, comparison, and historical review.

## Core Principle

The app should report what happened, not only how well it scored.

A useful record is not just:

- score
- pass/fail
- count
- duration

A useful record also includes the process content that explains those results.

## What Historical Inspection Should Support

For each meaningful output, we should be able to inspect:

- what source data or source revision it came from
- what stage produced or modified it
- what important intermediate forms existed
- what validation findings were attached to it
- what final geometry was retained or rejected
- how that output changed over time if later stages refined it

The reporting model should support output history, not just run summary.

## Preferred Reporting Model

Think in terms of structured event/report records such as:

- run-start report
- stage-start report
- stage-output report
- validation report
- promotion/disposal report
- final-output snapshot report

## Earliest Reporting Start

Reporting should start early, even before the full end-state pipeline exists.

The best starting point for `app-next` is:

1. simulation-stage layout capture
2. meaningful layout pass or promotion events

Why this starting point:

- it captures the first outputs worth inspecting historically
- it creates traceable output history early in development
- it exercises endpoint reporting before the full pipeline becomes large
- it avoids postponing observability until after the architecture is already hard to inspect

This means the earliest reporting implementation does not need every future stage. It does need to record the first meaningful generated layouts and the first accepted outputs.

These can be separate endpoint payloads or a coordinated family of report types.

## Minimum Useful Report Content

Each report should aim to carry enough information for later inspection.

Typical fields:

- `reportKind`
- `runId`
- `outputId`
- `stageId`
- `timestamp`
- `sourceId`
- `sourceVersion`
- `inputSummary`
- `artifactSummary`
- `validationSummary`
- `artifactContent`

For the earliest simulation/pass reporting, the payload should usually include:

- candidate or output identity
- source identity
- stage identity
- timestamp
- score or selection metrics
- canonical geometry snapshot or geometry reference
- pass, promotion, rejection, or reset reason when applicable

Not every report needs every field, but the reporting system as a whole should make the pipeline history reconstructable.

## Artifact Content Expectation

When practical, reports should include or reference meaningful content such as:

- canonical polygons
- room/cell identifiers
- stage metrics
- validation failures
- selected candidate snapshots
- refinement results
- discard reasons

If the content is too large to inline every time, the report can reference stored artifacts, but the reference must stay traceable.

For early reporting, prefer capturing actual accepted layout content at the simulation/pass boundary rather than only a metric summary.

## Self-Testing Expectation

Self-testing should verify more than endpoint availability.

Useful self-tests include:

- schema validity of report payloads
- presence of required identifiers
- stage-to-stage linkage integrity
- ability to reconstruct output history from stored reports
- consistency between reported geometry summaries and canonical artifacts

The reporting system itself is part of the test surface.

## Anti-Pattern

Do not reduce process reporting to only:

- aggregated stats
- dashboards with no underlying artifact access
- final-pass snapshots with no stage history
- untyped debug dumps that are hard to compare across runs

That approach hides the actual behavior of the generator.

## Target Outcome

A future reviewer should be able to inspect one output and answer:

- what went in
- what stages touched it
- what each stage produced
- why it passed, failed, or changed
- what geometry was finally emitted

If the reports do not support those questions, the reporting is not yet sufficient.

For the first reporting milestone, the same standard should already apply to simulation captures and pass events, even if later refinement stages have not been rebuilt yet.

## Runtime Inspection Path

`app-next` now includes a lightweight headless-browser runtime inspection path for rebuild validation.

Local runtime inspection assumes the app can be served through the repo-owned npm command path:

- `npm.cmd start`

Do not treat a global `ng serve` as the default validation entry point for this repo.

If runtime inspection or ordinary local serve fails before the browser even loads, check local machine state first:

- confirm `node_modules` is installed
- confirm the shell is not injecting `ELECTRON_RUN_AS_NODE=1` into the serve process

Current script:

- `npm run debug:runtime-inspection`

Current implementation:

- launches a local Chrome or Edge headless session against the simulation route
- listens for browser console events
- captures uncaught runtime exceptions
- captures browser log entries
- records a small DOM/state snapshot of the simulation page
- writes the result to `.codex-logs/runtime-inspection.json`

This inspection path exists to make simulation-stage checkpoints easier to validate without pretending that build success alone proves runtime behavior.

It has already demonstrated value during the rebuild by catching a browser-side simulation-route failure where the page seeded zero jobs and collapsed the preview surface even though the ordinary build and unit-test paths were still passing.

The runtime inspection path is not a replacement for unit tests or endpoint reporting.

It is an additional rebuild-time tool for answering questions such as:

- did the simulation page load without browser-side exceptions
- is the active preview producing visible bubbles
- is the simulation route exposing the expected stage text and live surface
- are console warnings or errors showing up during a supposedly runnable checkpoint
