---
name: data-modeling
description: Use quando desenhar ou revisar modelo de dados relacional com rigor arquitetural no PostgreSQL.
---

# Modelagem de dados

Use esta skill quando a tarefa exigir desenho estrutural de banco com clareza semântica, consistência relacional e trade-off explícito.

## Fluxo

1. Delimite o domínio e questione premissa ambígua antes de propor tabela ou coluna.
2. Identifique entidade principal, identidade, ciclo de vida e vigência.
3. Defina atributos por entidade com tipo, nulabilidade, unidade, precisão e exemplo de valor.
4. Modele relacionamento com cardinalidade, opcionalidade e regra de integridade.
5. Defina `primary key`, `foreign key`, `unique key`, `check` e restrição temporal quando necessário.
6. Aplique normalização até o ponto em que a semântica estrutural fique clara sem comprometer a leitura operacional.
7. Decida índice a partir de acesso, seletividade, volume e padrão de filtro, e não por hábito.
8. Use coluna relacional para dado que participa de integridade, filtro, `join`, vigência ou auditabilidade.
9. Use `JSONB` apenas para carga flexível, explicação, contrato variável ou detalhe secundário que não substitua semântica estrutural.
10. Entregue primeiro o modelo lógico e depois o modelo físico em PostgreSQL, com tipo, índice, partição e observação de performance.

## Restrições

- Não escolha tabela, coluna ou relacionamento por conveniência visual.
- Não proponha índice sem explicar o padrão de consulta que o justifica.
- Não trate o modelo físico como mero espelho automático do modelo conceitual; ajuste para volume, auditoria e operação.

## Entregáveis

- Lista de entidades.
- Descrição de cada entidade.
- Relações entre entidades com cardinalidade.
- Esquema de tabela proposto com coluna, tipo, `primary key`, `foreign key`, nulabilidade e exemplo.
- Observação de arquitetura com normalização, índice, uso de `JSONB` e trade-off físico no PostgreSQL.

## Formato de saída sugerido

- `lista de entidades`
- `descrição de cada entidade`
- `relações entre entidades`
- `esquema de tabela proposto`
- `observações de arquitetura`
