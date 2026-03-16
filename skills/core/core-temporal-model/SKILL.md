---
name: core-temporal-model
description: Use when modeling or reviewing the fixed structural core of the system: entities, optional country-aware hierarchical scope, event-based validity, UTC persistence, auditability, integrity, and daily materialized facts across the supported niches.
---

# Core Temporal Model

Use this skill for structural modeling decisions that must remain stable across niches.

Read these references as needed:
- `references/entities.md` for structural entities and boundaries.
- `references/temporal-rules.md` for validity, reconstruction, and immutability.
- `references/scope-hierarchy.md` for scope resolution and fallback.

## Workflow

1. Confirm the proposal keeps the calculation axis daily.
2. Separate structural entities from niche vocabulary.
3. Model operational changes as dated, auditable events persisted in UTC.
4. Include country as an optional scope node and persist the resolved country wherever economic facts depend on local currency.
5. Preserve immutable history and reconstructability.
6. Persist relevant outputs as daily materialized facts.

## Guardrails

- Do not hardcode niche vocabulary into the core schema.
- Do not treat week or month as native calculation grains.
- Do not replace structural semantics with free-form JSONB.
- Do not overwrite past values; version and date them.
- Do not let mutable user context define the persisted country of an economic fact.

## Deliverables

- Structural entity model.
- Temporal rules for validity and history.
- Scope hierarchy and fallback definition.
- Daily fact contract with provenance and versioning.
