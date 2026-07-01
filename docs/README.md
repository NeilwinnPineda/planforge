# Planforge Docs

This folder is the documentation home for the standalone `planforge` app repo.

## Read Order

Start here if you need repo shape and operating rules:

1. `ARCHITECTURE_RULES.md`
2. `REBUILD_ROADMAP.md`
3. `SELF_TESTING_AND_REPORTING.md`
4. `PROCESSING_PIPELINE_RULES.md`

Supporting references:

- `PROCEDURAL_GENERATION_AND_VISUAL_TERMINOLOGY.md`
- `AI_STEP_GUIDE.md`

## Repo Intent

This is the standalone generator repo, not a temporary `app-next` folder.

It should remain valid in two modes:

- standalone app development and deployment
- linked use from the Revit host repo during extension work

## Ownership

This repo owns:

- generation-side architecture
- browser workflow
- exports produced before Revit import
- app-local tests and E2E

This repo does not own:

- Revit execution surfaces
- Revit mutation logic
- transaction boundaries inside Revit
