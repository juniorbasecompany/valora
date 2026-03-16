# Entities

Structural entities for the shared core:

- item: the biological or operational unit defined by the active niche package
- segment: operational subdivision of the item
- hierarchical location: optional country, company, operational site, area, subdivision
- dated event: changes quantity, rule, parameter, relationship, or state
- configurable attribute metadata: defines semantics without altering schema
- daily materialized fact: persisted output for one date, one entity or segment, one attribute, one version

Boundaries:

- identity, relationships, validity, audit, versioning, and integrity stay in the core.
- niche terms, indicators, formulas, and panel labels stay outside the core.
