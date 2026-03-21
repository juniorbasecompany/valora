# Formato JSON do drawDB para diagrama ERD

Referência baseada no código-fonte do [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb) e na [documentação](https://drawdb-io.github.io/docs/). O diagrama é armazenado e exportado como JSON; ao importar, o drawDB reconstrói tabelas e relacionamentos.

## Raiz do documento

| Campo           | Obrigatório | Tipo   | Descrição |
|----------------|-------------|--------|-----------|
| `tables`       | sim         | array  | Lista de tabelas. |
| `relationships`| sim         | array  | Lista de relacionamentos (FK). |
| `notes`        | sim         | array  | Notas no canvas (pode ser `[]`). |
| `subjectAreas` | sim        | array  | Áreas/agrupamentos visuais (pode ser `[]`). |
| `title`        | não         | string | Título do diagrama. |
| `database`     | não         | string | Ex.: `"postgresql"`, `"generic"`. |
| `types`        | não         | array  | Tipos customizados (ex.: PostgreSQL). |
| `enums`        | não         | array  | Enums (ex.: PostgreSQL). |

## Tabela (`tables[]`)

| Campo     | Obrigatório | Tipo   | Descrição |
|----------|-------------|--------|-----------|
| `id`     | sim         | string | Identificador único (ex.: nanoid). |
| `name`   | sim         | string | Nome da tabela (ex.: `core.scope` ou `scope`). |
| `x`      | sim         | number | Posição X no canvas. |
| `y`      | sim         | number | Posição Y no canvas. |
| `fields` | sim         | array  | Colunas (ver Field). |
| `comment`| sim         | string | Comentário da tabela. |
| `indices`| sim         | array  | Índices (name, unique, fields). |
| `color`  | sim         | string | Cor em hex (ex.: `"#175e7a"`). |
| `locked` | não         | boolean| Tabela bloqueada. |
| `hidden` | não         | boolean| Ocultar no canvas. |

### Extensão do projeto: `constraints`

Não faz parte do esquema oficial do drawDB; o editor costuma **aceitar e preservar** chaves extras ao importar o JSON. Ao reexportar pelo drawDB, esses atributos podem ser omitidos — tratar `backend/erd/erd.json` no repositório como fonte de verdade.

#### Onde no JSON

- Dentro de **um** elemento de `tables[]` (objeto da tabela).
- Mesmo nível de chaves como `id`, `name`, `fields`, `indices`, `comment`, `color`, etc.
- **Não** colocar dentro de `fields[]`; cada field já tem o seu próprio `check` (texto livre por coluna).
- Ordem recomendada das chaves no objeto da tabela: manter a ordem já usada no ficheiro; ao adicionar, costuma-se inserir `constraints` **logo após** o fecho do array `fields`, antes de `indices`, para leitura humana.

#### Formato e conteúdo coerente

| Campo         | Obrigatório | Tipo   | Descrição |
|---------------|-------------|--------|-----------|
| `constraints` | não       | array  | Lista de regras em nível de tabela (várias colunas). |

Cada elemento da lista é um **objeto** com:

| Campo        | Obrigatório | Tipo   | Descrição |
|--------------|-------------|--------|-----------|
| `name`       | sim         | string | Identificador **curto** da constraint, adequado para uso no banco de dados. **Prefixo obrigatório:** o `name` da tabela (mesmo objeto JSON), depois `_` e o sufixo (snake_case). Ex.: tabela `member` → `member_name_required`. Se o nome da tabela tiver `.`, normalizar (ex.: `core.scope` → prefixo `core_scope`). **Único** entre os itens de `constraints` dessa tabela. Pode ser usado em DDL como `ALTER TABLE ... ADD CONSTRAINT name ...`. |
| `constraint` | sim         | string | **Apenas** a expressão SQL/DDL (ex.: `CHECK (...)`, `UNIQUE (...)`, `UNIQUE (...) WHERE ...`), **sem** descrições em português, explicações ou comentários. O conteúdo deve ser sintaxe SQL válida para o dialeto usado (ex.: PostgreSQL). |

Regras de coerência (JSON / diagrama):

1. Cada item **tem** as duas chaves `name` e `constraint` (não omitir uma delas; não usar outro nome de chave).
2. Valores **string**; evitar `name` ou `constraint` vazios após remoção de espaços, salvo convenção explícita do projeto.
3. **Unicidade:** não duplicar o mesmo `name` em dois objetos da mesma lista `constraints` da mesma tabela.
4. **Alinhamento com colunas:** dentro de `constraint`, referir colunas pelos **mesmos** nomes que em `fields[].name` dessa tabela (ex.: `display_name`, não um alias inventado só no JSON).
5. **Prefixo do `name` com o nome da tabela:** cada `name` de constraint deve começar pelo `name` da tabela (normalizado se necessário) + `_` + sufixo, para evitar colisões globais no catálogo do banco e manter rastreabilidade.
6. **`constraint` apenas SQL/DDL:** o valor de `constraint` deve conter **somente** a expressão SQL/DDL (ex.: `CHECK (...)`, `UNIQUE (...)`, `UNIQUE (...) WHERE ...`), **sem** descrições em português, explicações, comentários ou prefixos como "DDL sugerido (PostgreSQL):". A documentação textual da regra fica no campo `comment` da tabela ou em `fields[].check` quando aplicável.
7. **`fields[].check`:** para regra que cita uma única coluna, pode bastar o `check` do field; quando a regra envolve **mais de uma** coluna da tabela, usar `constraints` e, se quiser, um `check` curto na(s) coluna(s) a remeter à entrada em `constraints`.

#### Exemplo mínimo

```json
"name": "member",
"fields": [ ... ],
"constraints": [
  {
    "name": "member_name_required",
    "constraint": "CHECK (status = 2 OR (name IS NOT NULL AND btrim(name) <> ''))"
  },
  {
    "name": "member_unique_tenant_account",
    "constraint": "UNIQUE (tenant_id, account_id) WHERE account_id IS NOT NULL"
  }
],
"indices": []
```

**Importante:**
- `name` (da constraint): prefixo = `name` da tabela + `_` + sufixo em snake_case; adequado para DDL (sem espaços).
- `constraint`: **apenas** SQL/DDL, sem descrições em português. Exemplos válidos: `CHECK (...)`, `UNIQUE (...)`, `UNIQUE (...) WHERE ...`, `FOREIGN KEY (...) REFERENCES ...`.
- **Não incluir** em `constraint`: explicações como "Quando account_id não é NULL, a dupla (tenant_id, account_id) deve ser única" ou "DDL sugerido (PostgreSQL):".

## Campo / Coluna (`tables[].fields[]`)

| Campo      | Obrigatório | Tipo    | Descrição |
|-----------|-------------|---------|-----------|
| `id`      | sim         | string  | Identificador único do campo. |
| `name`    | sim         | string  | Nome da coluna. |
| `type`    | sim         | string  | Tipo (ex.: `INT`, `BIGINT`, `TEXT`, `TIMESTAMPTZ`, `DATE`, `NUMERIC`). |
| `default` | sim         | string/number/boolean | Valor default (vazio `""` se não houver). |
| `check`   | sim         | string  | Check constraint (texto livre). |
| `primary` | sim         | boolean | Faz parte da PK. |
| `unique`  | sim         | boolean | Único. |
| `notNull` | sim         | boolean | NOT NULL. |
| `increment`| sim        | boolean | Autoincrement / GENERATED/IDENTITY. |
| `comment` | sim         | string  | Comentário da coluna. |
| `size`    | não         | string/number | Tamanho (ex. precisão). |
| `values`  | não         | array   | Valores (ex. enum). |

## Relacionamento (`relationships[]`)

| Campo              | Obrigatório | Tipo   | Descrição |
|-------------------|-------------|--------|-----------|
| `id`              | sim         | string | Identificador único. |
| `name`            | sim         | string | Nome da FK (ex.: `fk_tabela_coluna_referencia`). |
| `startTableId`    | sim         | string | id da tabela que contém a FK. |
| `startFieldId`    | sim         | string | id do campo FK. |
| `endTableId`      | sim         | string | id da tabela referenciada. |
| `endFieldId`      | sim         | string | id do campo PK referenciado. |
| `cardinality`     | sim         | string | `"one_to_one"`, `"one_to_many"`, `"many_to_one"`. |
| `updateConstraint`| sim         | string | `"No action"`, `"Restrict"`, `"Cascade"`, `"Set null"`, `"Set default"`. |
| `deleteConstraint`| sim         | string | Mesmos valores que updateConstraint. |

Regra: a coluna de origem (`start`) referencia a coluna de destino (`end`). Normalmente `end` é PK; `start` é a coluna FK.

## Índice (`tables[].indices[]`)

| Campo   | Obrigatório | Tipo    | Descrição |
|--------|-------------|---------|-----------|
| `name`  | sim         | string  | Nome do índice. |
| `unique`| sim         | boolean | Índice único. |
| `fields`| sim         | array   | Lista de nomes de colunas. |

## Nota (`notes[]`)

| Campo   | Obrigatório | Tipo    |
|--------|-------------|---------|
| id     | sim         | integer |
| x, y   | sim         | number  |
| title  | sim         | string  |
| content| sim         | string  |
| color  | sim         | string (hex) |
| height | sim         | number  |
| locked | não         | boolean |

## Área / Subject area (`subjectAreas[]`)

| Campo   | Obrigatório | Tipo    |
|--------|-------------|---------|
| id     | sim         | integer |
| name   | sim         | string  |
| x, y   | sim         | number  |
| width  | sim         | number  |
| height | sim         | number  |
| color  | sim         | string (hex) |
| locked | não         | boolean |

## Mapeamento PostgreSQL → drawDB (tipos)

Exemplos: `bigint` → `BIGINT`, `text` → `TEXT`, `timestamptz` → `TIMESTAMPTZ`, `date` → `DATE`, `boolean` → `BOOLEAN`, `numeric(18,6)` → `NUMERIC`, `jsonb` → `JSONB`, `char(2)` → `CHAR`.

## Links oficiais

- [drawDB](https://www.drawdb.app/)
- [drawDB Docs](https://drawdb-io.github.io/docs/)
- [drawDB Editor (import/export)](https://www.drawdb.app/editor)
- [drawDB GitHub](https://github.com/drawdb-io/drawdb)
