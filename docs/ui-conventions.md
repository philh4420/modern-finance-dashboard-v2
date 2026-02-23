# UI Conventions (Tailwind + shadcn, 2026+)

## Default Component Rules

- Use `shadcn` primitives from `/Users/philhigdon/Desktop/modern finance dashboard copy/src/components/ui`.
- Prefer app wrappers over raw HTML tags in feature screens:
  - `SurfaceCard` instead of raw `<article>` cards/panels
  - `DataTable` instead of raw `<table>` in interactive app tabs
  - `PillBadge` instead of pill `<span>` tags
  - `CrudButton`, `CrudInput`, `CrudLabel`, `CrudSelect`, `CrudTextarea` for CRUD forms
  - `Dialog` primitives for modal flows (no manual backdrop + `role="dialog"` markup)
- Print/report views use print-safe wrappers:
  - `PrintSurface`
  - `PrintTable`

## Styling Placement

- Put shared design tokens and `fx-*` utility bridges in `/Users/philhigdon/Desktop/modern finance dashboard copy/src/index.css`.
- Keep `/Users/philhigdon/Desktop/modern finance dashboard copy/src/App.css` focused on legacy component-specific styles that have not been fully replaced yet.
- Avoid adding new global utility-like classes to `App.css` when a Tailwind class or `fx-*` utility will do.

## Legacy Compatibility

- Legacy `btn-*` and `pill-*` class tokens may still appear in feature code during migration.
- When used with `CrudButton`/`PillBadge`, these tokens act as compatibility hooks and should not be applied to new raw HTML elements.

## Regression Checks

- Run UI migration guardrails:

```bash
npm run check:ui
```

- Full verification:

```bash
npm run lint
npm test
npm run build
```
