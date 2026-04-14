# Changelog de enriquecimento do ERD

**Data:** 2026-04-14  
**Arquivo alterado:** [`backend/erd.json`](erd.json)  
**Objetivo:** registrar no diagrama (fonte de verdade) constraints, índices e uma nota de trigger já existentes no schema alinhado a [`backend/src/valora_backend/model/`](src/valora_backend/model/) e migrações Alembic.

## Confirmação: nada foi removido

Nenhuma tabela, campo, relacionamento, nota anterior ou constraint já existente no `erd.json` foi apagada ou substituída por uma versão reduzida. As mudanças são **somente inclusões** (`constraints`, entradas em `indices`, nova nota em `notes[]`).

## Resumo por tabela

### `field`

| Tipo | Nome | Conteúdo |
|------|------|----------|
| constraint | `field_age_flags_not_both_chk` | `CHECK (NOT (is_initial_age AND is_final_age))` |
| constraint | `field_scope_initial_age_unique` | `UNIQUE (scope_id) WHERE (is_initial_age IS TRUE)` |
| constraint | `field_scope_final_age_unique` | `UNIQUE (scope_id) WHERE (is_final_age IS TRUE)` |
| constraint | `field_scope_current_age_unique` | `UNIQUE (scope_id) WHERE (is_current_age IS TRUE)` |

**Referência no código:** [`Field.__table_args__`](src/valora_backend/model/rules.py) (`field_age_flags_not_both_chk`, índices únicos parciais com os mesmos nomes).

### `formula`

| Tipo | Nome | Conteúdo |
|------|------|----------|
| constraint | `formula_action_sort_order_unique` | `UNIQUE (action_id, sort_order)` |

**Referência no código:** [`Formula.__table_args__`](src/valora_backend/model/rules.py).

### `label`

| Tipo | Nome | Conteúdo |
|------|------|----------|
| constraint | `label_field_xor_action_chk` | exclusividade entre `field_id` e `action_id` |
| constraint | `label_unique_lang_field` | `UNIQUE (lang, field_id) WHERE field_id IS NOT NULL` |
| constraint | `label_unique_lang_action` | `UNIQUE (lang, action_id) WHERE action_id IS NOT NULL` |

**Referência no código:** [`Label.__table_args__`](src/valora_backend/model/rules.py).

### `location`

| Tipo | Nome | Conteúdo |
|------|------|----------|
| índice | `location_scope_parent_sort_idx` | colunas `scope_id`, `parent_location_id`, `sort_order`, `id` (não único) |
| índice | `location_scope_parent_name_idx` | colunas `scope_id`, `parent_location_id`, `name` (não único) |
| constraint | `location_parent_self_chk` | `CHECK (parent_location_id IS NULL OR parent_location_id <> id)` |
| constraint | `location_scope_id_unique` | `UNIQUE (scope_id, id)` |
| constraint | `location_parent_same_scope_fk` | `FOREIGN KEY (scope_id, parent_location_id) REFERENCES location (scope_id, id) ON UPDATE CASCADE ON DELETE CASCADE` |

**Referência no código:** [`Location.__table_args__`](src/valora_backend/model/identity.py).

### `item`

| Tipo | Nome | Conteúdo |
|------|------|----------|
| índice | `item_scope_parent_sort_idx` | colunas `scope_id`, `parent_item_id`, `sort_order`, `id` (não único) |
| índice | `item_scope_parent_kind_idx` | colunas `scope_id`, `parent_item_id`, `kind_id` (não único) |
| constraint | `item_parent_self_chk` | `CHECK (parent_item_id IS NULL OR parent_item_id <> id)` |
| constraint | `item_scope_id_unique` | `UNIQUE (scope_id, id)` |
| constraint | `item_parent_same_scope_fk` | `FOREIGN KEY (scope_id, parent_item_id) REFERENCES item (scope_id, id) ON UPDATE CASCADE ON DELETE CASCADE` |

**Referência no código:** [`Item.__table_args__`](src/valora_backend/model/identity.py).

### `log`

| Tipo | Nome | Conteúdo |
|------|------|----------|
| constraint | `log_row_payload_by_action_chk` | `CHECK` ligando `action_type` ao payload na coluna `row` (`NULL` em delete; obrigatório em insert/update) |

**Referência no código:** [`Log.__table_args__`](src/valora_backend/model/log.py) (`log_row_payload_by_action_chk`).

### Canvas (`notes[]`)

| Tipo | id | Título |
|------|-----|--------|
| nota | `5` | `event: trigger de consistência com unity` |

**Conteúdo:** descreve a função `validate_event_unity_consistency()`, o trigger `event_unity_consistency_trg` e o ficheiro de migração `a2b3c4d5e6f7_event_unity_consistency_trigger.py`.

**Referência no código:** [`a2b3c4d5e6f7_event_unity_consistency_trigger.py`](../alembic/versions/a2b3c4d5e6f7_event_unity_consistency_trigger.py).

## Tabelas não alteradas neste enriquecimento

Demais tabelas e relacionamentos permanecem como antes deste commit; em particular, `event` já tinha `event_unity_moment_pair` em `constraints` e não recebeu alteração estrutural além da nova nota no canvas.

## Validação sugerida

1. Importar `backend/erd.json` no drawDB (File > Import) e confirmar que o diagrama abre sem erro.
2. Conferir na UI as novas entradas em **constraints** / **indices** nas tabelas listadas acima e a nota **id 5**.
3. Opcional: comparar com `information_schema` / `\d+` no PostgreSQL se quiser validação contra um banco já migrado.
