---
name: rule-formula-simpleeval
description: Validação e avaliação restrita de `formula.statement` com simpleeval (lista branca de funções), com atribuição direta para `${field:id}` e sem variáveis intermediárias entre fórmulas.
---

# Expressões de regra com SimpleEval (atribuição direta)

## Objetivo

Padronizar a validação de **expressões Python restritas** com **[simpleeval](https://pypi.org/project/simpleeval/)** para `formula.statement` no contrato atual da API, evitando `exec`/`eval` livre ou scripts multilinha não controlados.

## Quando usar

- Implementar ou rever **fórmulas configuráveis** no backend.
- Rever **segurança** e superfície de funções expostas ao utilizador.
- Alinhar com o fluxo do [motor diário](../../core/daily-calc-engine/SKILL.md) e com a **proveniência** dos valores calculados.

## `formula.statement` na API (atribuição)

O texto persistido em [`formula.statement`](../../../backend/src/valora_backend/model/rules.py) usa **uma única linha lógica** de atribuição:

- **Lado esquerdo:** exclusivamente `${field:<id>}` (quem recebe o valor).
- **Separador:** primeiro caractere `=` na instrução (após trim).
- **Lado direito:** expressão de cálculo com referências `${field:…}` e funções da lista branca; internamente substituídas por nomes `f_<id>` para o SimpleEval.
- **Regra de modelagem:** não há variáveis/campos temporários intermediários entre fórmulas no contrato atual. Cada fórmula atribui diretamente para `${field:<id>}`.

Na gravação (`POST`/`PATCH` de fórmulas), o backend valida este formato, a existência dos `field_id` no escopo e um **dry-run** da RHS com valores stub (`Decimal("0")` por campo referido na expressão). Códigos estáveis de erro: `formula_invalid_assignment`, `formula_invalid_target`, `formula_unknown_field_id`, `formula_expression_invalid`. Implementação: `valora_backend/rules/formula_statement_validate.py` e `formula_simple_eval.py`.

## API conceitual

- `build_formula_simple_eval(names)`  
  Constrói um `SimpleEval` com `names` e `functions` restritos à lista branca.

- `validate_formula_statement_for_scope(session, scope_id, statement)`  
  Valida a atribuição (`LHS = RHS`), confirma referências no escopo e faz dry-run da `RHS`.

Implementação de referência: [reference.md](./reference.md).

## Funções permitidas (baseline)

O conjunto inicial documentado para o projeto:

| Função   | Uso típico                          |
|----------|-------------------------------------|
| `date`   | Construir datas para comparações    |
| `abs`    | Valor absoluto                      |
| `min`    | Mínimo                              |
| `max`    | Máximo                              |
| `round`  | Arredondamento                      |
| `Decimal`| Valores monetários / precisão fixa  |

**Novas funções** só entram na lista branca após **revisão explícita** (superfície de ataque, determinismo, efeitos colaterais).

## Limitações explícitas

- Cada `statement` deve seguir atribuição única `${field:id} = <expressão>`.
- Cada `expression` é **uma** expressão SimpleEval: **sem** `import`, **sem** módulo completo e sem outro operador de atribuição fora do separador principal.
- Não usar este padrão misturado com **FEEL**, **JSONLogic** ou outro motor na mesma regra sem decisão arquitectural e contrato de proveniência claros.

## Proveniência

Alinhar com:

- [Proveniência do motor diário](../../core/daily-calc-engine/references/provenance.md)
- [Princípios do sistema](../../../architecture/system-principles.md)

Ao persistir regras executadas pelo utilizador, gravar identificador e **versão** da regra, e inputs necessários para **reproduzir e explicar** o resultado (o que o contrato de proveniência já exige para valor derivado).

## Dependência

O pacote `simpleeval` está declarado em `backend/pyproject.toml` (intervalo de versão fixado, por exemplo `>=1.0.7,<2`). Em upgrades, rever changelog e regressões de segurança.

## Segurança

- Confiar na **lista branca** do SimpleEval (`functions` e conteúdo de `names`), não em `eval`/`exec` sem restrições.
- **Não** expor `__builtins__` completos ao avaliador.
- Em upgrades do pacote `simpleeval`, rever changelog e regressões de segurança.

## Referências

- Exemplo executável: [reference.md](./reference.md)
- Motor diário: [skills/core/daily-calc-engine/SKILL.md](../../core/daily-calc-engine/SKILL.md)
