---
name: analytics-and-panels
description: Use when designing analytical views, panel contracts, locale-aware formatting, and aggregations over the daily fact base for daily, weekly, monthly, annual, and custom-period analysis, including report-time currency conversion.
---

# Analytics And Panels

Use this skill for reporting and analytical delivery.

Read these references as needed:
- `references/analytic-grains.md`
- `references/official-views.md`
- `references/panel-contracts.md`
- `references/filters-and-slices.md`

## Workflow

1. Start from daily materialized facts.
2. Define the official analytical grains and allowed aggregations.
3. Specify panel contracts, locale behavior, and period behavior.
4. Apply currency conversion only as a derived report-time concern when requested.
5. Keep calculations consistent across daily and period views.

## Guardrails

- Do not create dashboard-only numbers disconnected from daily facts.
- Do not treat weekly panels as the native source of truth.
- Do define weekly panel semantics explicitly when they are part of the product contract.
- Keep filters and accumulation rules explicit.
- Do not persist converted reporting values as if they were source facts.
- Do not treat converted-currency reports as auditable financial records.

## Deliverables

- Official analytical grains.
- Panel contracts.
- Filter and period semantics.
