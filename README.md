# App Next

`testing/app-next` is the fresh Angular rebuild path for the production-oriented generator UI.

This folder exists on purpose beside the legacy prototype in `testing/app`.

## Purpose

The purpose of `app-next` is to take a structured building design data source and produce polygon-based building layout output.

More specifically, the app is intended to:

- load a typed design brief / source dataset
- derive the constraints needed for layout generation
- generate and refine candidate building layouts
- validate those candidates against design and technical rules
- output canonical polygonal room and layout geometry
- project that geometry into visuals for inspection, comparison, and later downstream handoff

The primary product is not just a screen or a simulation animation.

The primary product is layout geometry:

- room polygons
- circulation polygons
- boundary-aligned layout polygons
- supporting metrics and validation results tied to that geometry

Visuals exist to inspect and communicate the generated polygonal results, not to replace them as the source of truth.

The app is also expected to self-test and report its process history. Outputs should be inspectable over time through structured endpoint reporting, including meaningful stage content rather than summary stats alone.

Rules for this workspace:

- Do not delete or rewrite `testing/app` as part of `app-next` work.
- Rebuild in feature-path order, one slice at a time.
- Do not bulk-copy the monolithic prototype into this app.
- Keep handoff clean: each slice should be understandable on its own.
- Prefer small focused modules over large multi-purpose files.

Primary architecture rules live in `docs/ARCHITECTURE_RULES.md`.

Continuation guidance for future agents lives in `docs/AI_STEP_GUIDE.md`.
