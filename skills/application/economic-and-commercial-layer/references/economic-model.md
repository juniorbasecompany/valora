# Economic Model

Economic outputs should be daily first, then aggregated.

Currency rules:

- economic facts are stored only in the local currency of the operation
- local currency is derived from the persisted country or operation context
- no exchange rate is persisted in the economic fact
- no converted amount is persisted in the economic fact
- conversion to another currency happens only in the query or reporting layer, using the record timestamp and the user's requested currency
- the auditable financial history is the local-currency fact only
- converted reports are presentational views and do not replace the local audited fact

Core measures:

- daily price reference
- daily revenue
- daily cost
- cost per item
- cost per commercial unit
- cost per saleable output unit
- gross margin
- operating profit

The lack of this layer is one of the main gaps identified in planning.
