# Aggregation Rules

Aggregations are attribute-dependent and must be explicit.

Common patterns:

- sum
- average
- weighted average
- last value
- min
- max

Rules:

- totals for month, week, year, company, or item must derive from daily facts.
- aggregation behavior is metadata, not dashboard-only logic.
- invalid combinations must be blocked early.
