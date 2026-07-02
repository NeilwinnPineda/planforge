# Planforge Docs

This folder is the documentation home for the standalone `planforge` app repo.

## Read Order

Start here if you want one central guide first:

1. `PLANFORGE_CENTRAL_GUIDE.md`
2. `PLANFORGE_PRODUCT_GUIDE.md`
3. `PLANFORGE_SYSTEM_GUIDE.md`

Then use the detailed references only when needed:

4. `REBUILD_ROADMAP.md`
5. `AI_STEP_GUIDE.md`

Supporting references:

- `APP_GOALS_AND_TARGETS.md`
- `ARCHITECTURE_RULES.md`
- `APP_CONTENT_AND_PRODUCT_DESIGN.md`
- `VISUAL_LANGUAGE_SYSTEM.md`
- `PANEL_PRESENTATION_AND_VISUALIZATION_RULES.md`
- `SELF_TESTING_AND_REPORTING.md`
- `PROCESSING_PIPELINE_RULES.md`
- `PROCEDURAL_GENERATION_AND_VISUAL_TERMINOLOGY.md`

## Fast Path

If you do not want to bounce around the docs folder:

- read `PLANFORGE_CENTRAL_GUIDE.md`
- then use `PLANFORGE_PRODUCT_GUIDE.md` or `PLANFORGE_SYSTEM_GUIDE.md` depending on whether the question is product-facing or system-facing
- treat the older overlapping docs as reference redirects

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
- product-facing content and presentation rules

Testing expectation:

- feature work should update automated tests as features are added
- logic changes should add or update unit/integration coverage
- route and interaction changes should add or update E2E coverage
- if test coverage is intentionally deferred, the gap should be documented

Visual consistency expectation:

- accepted UI direction changes should be documented in the design docs
- route-level styling changes should be treated as candidates for app-wide rollout
- shared controls and panel language should not diverge page by page without an explicit reason

This repo does not own:

- Revit execution surfaces
- Revit mutation logic
- transaction boundaries inside Revit
