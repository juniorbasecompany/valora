---
name: analytics-and-panels
description: Use quando desenhar visão analítica, contrato de painel, formatação por localidade e agregação para análise diária, semanal, mensal, anual e por período personalizado.
---

# Camada analítica e painel

Use esta skill para entrega analítica e de relatório.

Leia estas referências conforme necessário:
- `references/analytic-grains.md`
- `references/official-views.md`
- `references/panel-contracts.md`
- `references/filters-and-slices.md`

## Fluxo

1. Parta da base oficial do produto.
2. Defina o grão analítico oficial e a agregação permitida.
3. Especifique contrato de painel, comportamento de localidade e comportamento de período.
4. Defina como filtro, acumulação e visão por período preservam a mesma semântica analítica.

## Restrições

- Defina explicitamente a semântica semanal quando ela fizer parte do contrato do produto.
- Mantenha filtro e regra de acumulação explícitos.

## Entregáveis

- Grão analítico oficial.
- Contrato de painel.
- Semântica de filtro e período.
