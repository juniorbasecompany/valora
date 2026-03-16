# Panel Contracts

Panel contracts should define:

- metrics shown
- comparison layers shown
- default period and selectable periods
- accumulation behavior
- filter set
- sort and grouping semantics
- locale for labels and formatting
- timezone rendering behavior
- whether the report is shown in local currency or in a query-time converted currency
- whether the outputs per period are on-demand derived views or governed derived snapshots
- whether the panel is auditable in local currency only or merely presentational after currency conversion

The report panels are derived views per period over daily facts.
