---
name: agricultural-domain-package
description: Use when working with agricultural or soy-specific vocabulary, entities, events, stage-based curves, classifications, KPIs, validations, and business semantics on top of the shared core, including global curves with optional country and local overrides.
---

# Agricultural Domain Package

Use this skill for agricultural semantics. Pair it with one or more core skills when the task affects structure or calculation.

Read these references as needed:
- `references/domain-vocabulary.md`
- `references/agricultural-entities.md`
- `references/agricultural-events.md`
- `references/agricultural-curves.md`
- `references/agricultural-kpis.md`
- `references/agricultural-validations.md`

## Workflow

1. Translate the business term into structural entities and configurable metadata.
2. Keep agricultural semantics in the package, not in the core schema.
3. Use age-based or phenological curves and governed event catalogs.
4. Treat global curves as defaults and allow country or local overrides through fallback.
5. Validate outputs against the expected daily operational reality.

## Guardrails

- Do not assume every niche has agricultural concepts.
- Do not turn package vocabulary into structural column names.
- Keep domain formulas and validations explicit.

## Deliverables

- Domain vocabulary mapping.
- Agricultural event and curve definitions.
- KPI and validation guidance.
