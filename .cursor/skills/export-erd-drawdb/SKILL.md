---
name: export-erd-drawdb
description: ERD do projeto em formato drawDB. Fonte de verdade em backend/sql/erd.json. Use quando o usuário pedir o ERD para drawdb.app, consultar o diagrama ou o formato JSON compatível com https://www.drawdb.app/ e https://drawdb-io.github.io/docs/
---

# Exportar ERD no formato JSON do drawDB

## Objetivo

A fonte de verdade do ERD do projeto é `backend/sql/erd.json` (formato JSON do [drawDB](https://www.drawdb.app/)). O restante do sistema deve ser atualizado conforme o conteúdo de `erd.json`.

## Quando usar

- Usuário pede para consultar ou editar o ERD no drawDB.
- Referência ao formato e à localização do diagrama (fonte de verdade).

## Fluxo

1. **Fonte de verdade do diagrama**: `backend/sql/erd.json`. O restante do sistema é atualizado conforme esse arquivo.
2. **Importar no drawDB**: em https://www.drawdb.app/editor usar **File > Import** e escolher `backend/sql/erd.json`. Edições no drawDB podem ser exportadas de volta para manter o arquivo em sincronia.

## Formato JSON (resumo)

O drawDB espera um objeto com:

- `tables`: lista de tabelas (id, name, x, y, fields, comment, indices, color).
- `relationships`: lista de relacionamentos (startTableId, startFieldId, endTableId, endFieldId, cardinality, etc.).
- `notes`: array (pode ser `[]`).
- `subjectAreas`: array (pode ser `[]`).

Cada **field** em `tables[].fields` deve ter: `id`, `name`, `type`, `default`, `check`, `primary`, `unique`, `notNull`, `increment`, `comment`.  
Cada **relationship** deve ter: `id`, `name`, `startTableId`, `startFieldId`, `endTableId`, `endFieldId`, `cardinality`, `updateConstraint`, `deleteConstraint`.

Cardinalidade: `"one_to_one"`, `"one_to_many"`, `"many_to_one"`.  
Constraints de FK: `"No action"`, `"Restrict"`, `"Cascade"`, `"Set null"`, `"Set default"`.

## Referência completa

Para o esquema JSON completo (tipos, enums, áreas, notas), ver [reference.md](reference.md). Documentação oficial: [drawDB Docs](https://drawdb-io.github.io/docs/), [drawDB Editor](https://www.drawdb.app/editor).

## Manutenção

- A fonte de verdade do diagrama é `backend/sql/erd.json`; edições no drawDB ou no repo devem refletir nesse arquivo.
