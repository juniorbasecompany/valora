# Plano: sincronizar base de dados com o ERD (comentários, notas e constraints)

## Decisões confirmadas (fora do texto literal do ERD)

- **`result.parent_result_id`:** usar `ON DELETE CASCADE` no FK para `result.id`, alinhado ao comentário da coluna no ERD (filhos removidos com o pai). O relacionamento drawDB em `deleteConstraint: Restrict` fica desatualizado em relação ao DDL; convém ajustar o JSON do diagrama depois para refletir Cascade.
- **`action.scope_id`:** `NOT NULL` no banco (toda ação pertence a um `scope`), em vez do nullable do desenho atual no ERD; atualizar [`backend/erd.json`](backend/erd.json) (`notNull: true` e FK obrigatória) para não haver deriva.

---

## Fonte de verdade

- Diagrama e metadados: [`backend/erd.json`](backend/erd.json) ([skill export-erd-drawdb](.cursor/skills/export-erd-drawdb/SKILL.md)).
- Auditoria: [skill audit-log-triggers](.cursor/skills/audit-log-triggers/SKILL.md).

---

## Inventário: comentários e checks por tabela (novas entidades)

### `field`

- **Tabela:** definição do campo (ex.: quantidade, mortes, valor).
- **Colunas:** `id` (PK BIGINT), `scope_id` NOT NULL, `type` TEXT NOT NULL (comentário: tipo SQL completo, ex. `INTEGER`, `NUMERIC(15,2)`, `BOOLEAN`).
- **Checks em `fields[]`:** nenhum além dos NOT NULL/PK.
- **FK:** `scope_id` → `scope.id` (conforme `relationships`: Cascade update, Cascade delete).

### `action`

- **Tabela:** ações (ex.: Alojamento, Mortalidade).
- **Colunas:** `id`, `scope_id` (**NOT NULL** por decisão acima).
- **FK:** `scope_id` → `scope.id` (Restrict on delete no diagrama).

### `formula`

- **Tabela:** fórmulas por ação.
- **Colunas:** `action_id` NOT NULL, `step` INTEGER NOT NULL, `statement` TEXT NOT NULL.
- **Comentário `statement`:** exemplo `${field:1} = ${field:1} * ${field:2}`; apresentação amigável ao utilizador.
- **Comentário `step`:** ordem de execução; **UNIQUE por `(action_id, step)`** (explicitar em DDL: `UNIQUE (action_id, step)` ou constraint nomeada).

### `label`

- **Tabela:** nome amigável para campo ou ação; **exatamente um** entre `field_id` e `action_id` preenchido; **unique** por `(lang, field_id)` e por `(lang, action_id)` (comentário de tabela).
- **`lang`:** `CHECK (lang IN ('pt-BR', 'en', 'es'))` (campo `check` no ERD).
- **DDL:** além dos FKs,
  - `CHECK` de exclusividade: ex. `(field_id IS NOT NULL AND action_id IS NULL) OR (field_id IS NULL AND action_id IS NOT NULL)`;
  - índices únicos parciais: `UNIQUE (lang, field_id) WHERE field_id IS NOT NULL` e `UNIQUE (lang, action_id) WHERE action_id IS NOT NULL`.

### `event`

- **Tabela:** momento em que uma fórmula/ação se aplica.
- **Colunas:** `location_id`, `item_id`, `moment_utc`, `action_id` (todos NOT NULL no ERD; `action_id` com comentário vazio no JSON mas obrigatório).
- **Default `moment_utc`:** `now() AT TIME ZONE 'UTC'` (traduzir para default PostgreSQL equivalente, ex. `timezone('utc', now())` ou `(now() AT TIME ZONE 'utc')` conforme tipo `TIMESTAMP`/`TIMESTAMPTZ` escolhido; alinhar com padrão já usado em `log` no projeto).
- **FKs:** para `location`, `item`, `action` com `Restrict` on delete (diagrama).

### `input`

- **Tabela:** valores de parâmetros de entrada por evento/dia.
- **Colunas:** `event_id`, `field_id`, `value` TEXT NOT NULL; comentários descrevem conversão de texto para tipo nativo segundo `field.type`.

### `result`

- **Tabela:** resultados de fórmulas por evento.
- **Colunas:** `event_id`, `value` TEXT NOT NULL, `parent_result_id` nullable, `moment_utc` NOT NULL, `field_id` NOT NULL.
- **Comentário `parent_result_id`:** remoção em cascata dos filhos com o pai → **ON DELETE CASCADE** (decisão confirmada).
- **FK auto-referência:** `parent_result_id` → `result.id` com **Cascade** on delete; **Restrict** no diagrama para este auto-rel não acompanha o comentário, atualizar ERD depois.

---

## Notas soltas no ERD (`notes[]`) — comportamento esperado

1. **`formula.statement` e `field.id`:** tokens `${field:X}` e `${input:X}` são vínculo lógico por ID embutido no texto; **não é FK**; integridade por parsing/validação na aplicação ([referência na skill rule-formula-simpleeval](skills/implementation/rule-formula-simpleeval/SKILL.md)).
2. **Tokens `${field:X}` / `${input:X}`:** padrão rígido e validação por parsing (nota 1 e 2 combinadas).
3. **`label.field_id` e `label.action_id`:** coberto pelo `CHECK` de exclusividade e unicidades parciais acima.

---

## Tabela `log` — deriva entre ERD e código

No [`erd.json`](backend/erd.json), o `check` de `log.table_name` **já inclui** `'action', 'event', 'field', 'formula', 'input', 'label', 'result'` além de `account`, `location`, `member`, `scope`, `tenant`, `item`.

O modelo atual [`log.py`](backend/src/valora_backend/model/log.py) só lista seis nomes (`tenant` … `item`). Ao implementar as novas tabelas:

1. Atualizar o `CheckConstraint` em `log.py` para **coincidir com o ERD** (lista completa e ordem canónica opcional).
2. Migração: substituir o CHECK existente pelo novo conjunto de valores.
3. Seguir [audit-log-triggers](.cursor/skills/audit-log-triggers/SKILL.md): criar trigger `AFTER INSERT OR UPDATE OR DELETE` em cada nova tabela monitorizada, usando `valora_audit_row_to_log()`.

---

## `backend/erd.json` — extensão `constraints` (skill drawDB)

Após fechar o DDL, acrescentar em `tables[]` para as tabelas novas (onde aplicável), no formato `name` + `constraint` só com expressão SQL:

- **label:** `label_field_xor_action_chk` (CHECK exclusividade); `label_unique_lang_field` / `label_unique_lang_action` como UNIQUE parciais **se** o drawDB suportar na constraint string (senão documentar nos comentários e manter só na migração).
- **formula:** `UNIQUE (action_id, step)`.

(Convém ver [reference.md](.cursor/skills/export-erd-drawdb/reference.md) para limitações do import.)

---

## Ordem de migração sugerida

1. `action` (com `scope_id NOT NULL`), `field`.
2. `formula`, `label` (checks e uniques).
3. `event`.
4. `input`, `result` (FK `parent_result_id` com ON DELETE CASCADE).

Em paralelo ou na mesma release: atualização de `log` (CHECK + triggers) para as sete tabelas novas.

---

## Tarefas (checklist)

- [ ] Migração Alembic: tabelas, FKs, CHECKs, uniques, default `moment_utc` onde o ERD indica.
- [ ] Modelos SQLAlchemy + comentários em PT-BR alinhados aos textos do ERD.
- [ ] Ajustar `log` (modelo + migração) e triggers de auditoria para as novas tabelas.
- [ ] Atualizar `erd.json`: `action.scope_id` notNull; relacionamento `result.parent_result_id` se passar a Cascade; opcionalmente blocos `constraints` nas tabelas novas.
- [ ] Testes de migração / smoke ORM; testes de trigger com `VALORA_AUDIT_PG_TEST=1` se aplicável.

---

## Fora do DDL (aplicação)

- Validação de tokens em `formula.statement`.
- Regra opcional futura: `location`/`item`/`action` no mesmo `scope` (não descrita como CHECK no ERD).
