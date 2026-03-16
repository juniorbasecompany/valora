# Country In Scope

Country behavior for this project:

- country is an optional node in the location hierarchy
- user context may prefill country in the interface, but must not define persisted economic history by itself
- for any economic fact, the resolved country must come from stored operational context
- fallback may resolve values through country when national defaults exist

Canonical specificity order:

1. segment
2. item
3. most specific location node
4. parent location nodes
5. country
6. global

Small operations may omit intermediate levels they do not use.
