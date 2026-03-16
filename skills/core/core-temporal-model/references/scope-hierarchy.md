# Scope Hierarchy

Canonical resolution rule:

1. segment-specific value
2. item-specific value
3. most specific location node
4. parent location nodes up the hierarchy
5. country-specific value
6. global default

Requirements:

- country is an optional node in the location hierarchy, not a separate parallel mechanism
- small operations may omit intermediate levels they do not use
- every resolved value must record which scope supplied it
- fallback order is always from the most specific resolved scope to the least specific
