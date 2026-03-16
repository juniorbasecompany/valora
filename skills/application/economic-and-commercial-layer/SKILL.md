---
name: economic-and-commercial-layer
description: Use quando modelar ou revisar a camada econômica e comercial diária, da produção até a unidade comercial, com foco em faturamento, custo, margem, lucro e saldo operacional.
---

# Camada econômica e comercial

Use esta skill para a camada de negócio que vai além da produção técnica.

Leia estas referências conforme necessário:
- `references/economic-model.md`
- `references/commercial-flow.md`
- `references/contribution-margin.md`

## Fluxo

1. Parta do fato diário de produção.
2. Converta saída técnica em medida comercial e econômica.
3. Defina contrato de faturamento, custo, margem e lucro conforme o contexto operacional persistido.
4. Separe visão operacional auditável de visão derivada de relatório.
5. Agregue depois por semana, mês, ano ou qualquer período.

## Restrições

- Não separe custo e faturamento da mesma base analítica diária.
- Mantenha explícita a regra de conversão de unidade.
- Exija país persistido ou contexto equivalente de moeda local em toda operação econômica.

## Entregáveis

- Modelo econômico diário.
- Mapeamento do fluxo comercial.
- Contrato de margem e lucro.
- Limite de auditoria entre fato operacional e relatório derivado.
