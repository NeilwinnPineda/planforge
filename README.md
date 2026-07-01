# Planforge

`planforge` is the standalone app repo for the residential layout generator.

It is intended to run independently as its own product workspace and also be consumed by the Revit-side workspace as a linked dependency during extension development.

## Repo Role

`planforge` owns the generator-side product concerns:

- structured source intake
- lot geometry derivation
- deterministic generation
- simulation
- downstream processing
- verification
- construction-oriented export
- browser-side reporting, diagnostics, and E2E

`planforge` does not own:

- Revit thread routing
- Revit transactions
- Revit preview/apply orchestration
- Revit-specific family/document mutation rules

Those stay in the Revit host repo.

## Relationship To `ProjectRevit`

The intended repo shape is:

- `planforge` is the standalone app repo
- `ProjectRevit` is the Revit extension repo
- `ProjectRevit` can include `planforge` as a submodule or linked workspace for integrated development

That means this repo must remain valid on its own:

- it should build on its own
- it should serve on its own
- it should test on its own
- it should not depend on `testing/` paths from the Revit host repo as an ownership model

Legacy references can still be traced from `ProjectRevit/testing/legacy-reference/app`, but that is migration context, not product ownership.

## Intended App Shape

```text
planforge/
  src/
    app/
      shell/
      features/
        source-intake/
        generation/
        processing/
        verification/
        outputs/
        construction/
      core/
        contracts/
        export/
        generation/
        geometry/
        integrations/
        processing/
        reporting/
      shared/
        ui/
        utils/
  docs/
    README.md
    architecture/
    workflows/
    exports/
  e2e/
  public/
  scripts/
```

## Local Development

Preferred local flow:

1. `npm install`
2. `npm.cmd start`

Production build:

1. `npm run build`

Browser E2E:

1. `npm.cmd run test:e2e`

Contract boundary validation:

1. `npm.cmd run test:contracts`

## Docs

Start with:

- `docs/README.md`
- `docs/ARCHITECTURE_RULES.md`
- `docs/REBUILD_ROADMAP.md`
- `docs/SELF_TESTING_AND_REPORTING.md`
