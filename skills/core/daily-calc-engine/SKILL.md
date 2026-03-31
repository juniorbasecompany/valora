---
name: daily-calc-engine
description: Use quando implementar ou revisar o fluxo de cálculo diário: fallback de escopo, resolução de vigência, métrica derivada, proveniência e persistência do fato diário materializado.
---

# Motor de cálculo diário

Use esta skill para o fluxo oficial de cálculo diário.

Leia estas referências conforme necessário:
- `references/calc-flow.md`
- `references/provenance.md`
- `references/materialized-facts.md`

Para **fórmulas configuráveis** no backend (expressões com SimpleEval, lista branca de funções e validação de `formula.statement` com atribuição direta para `${field:id}`), ver [skills/implementation/rule-formula-simpleeval/SKILL.md](../../implementation/rule-formula-simpleeval/SKILL.md).

## Fluxo

1. Selecione a entidade ou o segmento ativo para a data.
2. Resolva o atributo e a regra válidos para aquela data.
3. Aplique o fallback de escopo governado.
4. Resolva a classificação e a referência de curva.
5. Calcule o valor derivado.
6. Persista o fato diário com proveniência e versão.

## Restrições

- O diário é o único grão nativo de cálculo.
- Todo valor calculado deve ser explicável.

## Entregáveis

- Fluxo ordenado de cálculo diário.
- Contrato de proveniência.
- Contrato de persistência do fato diário.
