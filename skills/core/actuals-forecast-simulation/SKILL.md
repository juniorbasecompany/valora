---
name: actuals-forecast-simulation
description: Use quando tratar a camada analítica do sistema: previsão base, realizado, previsão corrigida, simulação de cenário e reconciliação entre essas camadas.
---

# Realizado, previsão e simulação

Use esta skill quando a tarefa tocar a camada analítica, e não apenas o modelo estrutural.

Leia estas referências conforme necessário:
- `references/forecast-modes.md`
- `references/reconciliation.md`
- `references/scenario-model.md`

## Fluxo

1. Identifique a qual camada a tarefa pertence.
2. Mantenha previsão, realizado, previsão corrigida e simulação separadas.
3. Compare as camadas por meio de fato diário compartilhado e agregação governada.
4. Preserve a auditabilidade em todo recálculo.

## Restrições

- Realizado não sobrescreve previsão base.
- Simulação não altera histórico de produção.
- A previsão corrigida deve declarar a regra de correção.

## Entregáveis

- Definição de camada.
- Regra de reconciliação.
- Regra de isolamento de cenário.
