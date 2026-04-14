# Plano: enriquecer `backend/erd.json` (somente aditivo)

## Decisão confirmada

- **Enriquecer o ERD** para espelhar constraints, índices e regras já existentes no schema aplicado (models em [`backend/src/valora_backend/model/`](backend/src/valora_backend/model/) e migrações em [`backend/alembic/versions/`](backend/alembic/versions/)).
- **Nada é removido nem reescrito de forma a apagar o conteúdo atual do diagrama:** não excluir tabelas, campos, relacionamentos, notas nem constraints já presentes; não “substituir” blocos inteiros por versões menores. Apenas **acrescentar** entradas em `constraints`, `indices`, comentários suplementares em `fields[].check` (sem apagar texto existente), e **novas** entradas em `notes[]` quando necessário.
- **Convenção de nomes** de constraints novas: seguir [`.cursor/skills/export-erd-drawdb/SKILL.md`](.cursor/skills/export-erd-drawdb/SKILL.md) (`name` da tabela + `_` + sufixo; `constraint` só com DDL).

## Objetivo do enriquecimento

Fazer o `erd.json` refletir fielmente o que o PostgreSQL já garante, para que a **fonte de verdade do diagrama** não fique “pobre” em relação ao banco real, sem perder o desenho atual.

## O que será acrescentado (por tabela)

Valores abaixo devem ser copiados do DDL já definido nos modelos/migrações (nomes de constraint podem ser ajustados só se o banco usar outro nome; a execução confere com `information_schema` ou com o código fonte).

### `field`

- Em `tables[].constraints` (novo ou acrescentado ao array existente):
  - `CHECK` `field_age_flags_not_both_chk`: `NOT (is_initial_age AND is_final_age)`.
- Em `tables[].indices` (hoje vazio): índices **únicos parciais** alinhados ao modelo:
  - `field_scope_initial_age_unique` em `(scope_id)` WHERE `is_initial_age IS TRUE`;
  - `field_scope_final_age_unique` em `(scope_id)` WHERE `is_final_age IS TRUE`;
  - `field_scope_current_age_unique` em `(scope_id)` WHERE `is_current_age IS TRUE`.

### `formula`

- Em `constraints`: `UNIQUE (action_id, sort_order)` com o nome usado no banco (ex.: `formula_action_sort_order_unique`), coerente com [`rules.py`](backend/src/valora_backend/model/rules.py).

### `label`

- Em `constraints`:
  - `CHECK` `label_field_xor_action_chk`: exatamente um entre `field_id` e `action_id` preenchido (expressão igual à do modelo).
- Em `indices`: unicidades parciais por idioma:
  - `label_unique_lang_field` em `(lang, field_id)` WHERE `field_id IS NOT NULL`;
  - `label_unique_lang_action` em `(lang, action_id)` WHERE `action_id IS NOT NULL`.

### `location`

- Em `constraints`:
  - `CHECK` `location_parent_self_chk`: `parent_location_id IS NULL OR parent_location_id <> id`;
  - `UNIQUE (scope_id, id)` se ainda não estiver representado (nome no banco: `location_scope_id_unique`);
  - FK composta `location_parent_same_scope_fk`: `(scope_id, parent_location_id)` referencia `(location.scope_id, location.id)` com política de delete/update do modelo.
- Em `indices`: índices de navegação já existentes no schema (ex.: `location_scope_parent_sort_idx`, `location_scope_parent_name_idx`), reproduzidos conforme DDL.

### `item`

- Em `constraints`:
  - `CHECK` `item_parent_self_chk`;
  - `UNIQUE (scope_id, id)` (`item_scope_id_unique`);
  - FK composta `item_parent_same_scope_fk` para hierarquia no mesmo escopo.
- Em `indices`: `item_scope_parent_sort_idx`, `item_scope_parent_kind_idx` conforme DDL.

### `log`

- Em `constraints`:
  - `CHECK` `log_row_payload_by_action_chk`: payload da coluna `row` conforme tipo de ação (`I`/`U` exigem `row` NOT NULL; `D` exige `row` NULL), como em [`log.py`](backend/src/valora_backend/model/log.py).

### `event` (regra fora de FK simples)

- O banco aplica consistência **unity × location × item** via **trigger** (não é só FK). Não substituir relacionamentos do drawDB; **acrescentar** uma entrada em `notes[]` descrevendo a regra e referenciando a migration/trigger no repositório (texto em português do Brasil; nomes técnicos em inglês).

## Entregável para você validar com clareza

1. **Arquivo de changelog** na raiz do backend (mesmo PR que o `erd.json`):
   - [`backend/erd.enrichment-changelog.md`](backend/erd.enrichment-changelog.md) (nome fixo sugerido).
2. Conteúdo mínimo do changelog:
   - Data e referência ao commit.
   - Lista **por tabela**: o que foi **adicionado** (somente adições), com:
     - tipo (constraint / índice / nota);
     - nome no banco ou no diagrama;
     - trecho DDL ou referência ao objeto no código (`__table_args__`, migration).
   - Secção **“Nada foi removido”** confirmando explicitamente que o diff é apenas inclusões.
3. **Opcional:** diff estatístico (`+` linhas no `erd.json`) no PR para revisão visual rápida.

## Passos de execução (quando você autorizar)

1. Ler DDL efetivo dos modelos citados e, se necessário, cabeça da cadeia Alembic para nomes exatos.
2. Editar **apenas por adição** [`backend/erd.json`](backend/erd.json): `constraints`, `indices`, `notes[]`; opcionalmente reforçar `fields[].check` **sem apagar** checks existentes.
3. Escrever [`backend/erd.enrichment-changelog.md`](backend/erd.enrichment-changelog.md) conforme acima.
4. Importar no drawDB (File > Import) e validar visualmente; ajustar só se faltar entrada **aditiva**.

## Fora de escopo deste plano

- Remover colunas “legadas” do ERD que não existam mais no banco (isso seria remoção; não fazer neste enriquecimento).
- Alterar migrações ou dados; aqui só documentação/diagrama.

## Checklist de validação (para você)

- [x] Cada constraint/índice listado no changelog aparece no `erd.json` ou em `notes[]` (triggers).
- [x] Nenhuma tabela/campo/relacionamento sumiu do JSON.
- [ ] Import no drawDB abre sem erro e o diagrama mantém o layout esperado (validação manual pelo autor).

**Execução:** enriquecimento aplicado em `backend/erd.json` e registo em `backend/erd.enrichment-changelog.md` (2026-04-14).
