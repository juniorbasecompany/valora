---
name: metadata-governance
description: Use quando definir ou revisar atributo configurável, classificação, regra, rótulo por localidade, sobrescrita por país, unidade, agregação e catálogo governado de nicho.
---

# Governança de metadado

Use esta skill quando a tarefa envolver a camada semântica configurável.

Leia estas referências conforme necessário:
- `references/attribute-contract.md`
- `references/rule-catalog.md`
- `references/aggregation-rules.md`

## Fluxo

1. Identifique quais conceitos são estruturais e quais são configuráveis.
2. Defina o contrato semântico mínimo de cada atributo.
3. Mova a semântica de nicho para metadado configurável governado.
4. Governe regra permitida, fórmula, origem, agregação e sobrescrita por país.
5. Suporte rótulo traduzido sem alterar chave técnica estável.
6. Suporte múltiplos eixos de classificação sobre a mesma entidade quando o nicho precisar disso.
7. Mantenha o pacote de nicho apoiado nessa camada de metadado.

## Restrições

- Evite EAV irrestrito e sem contrato semântico.
- Mantenha fórmula e agregação governadas, e não como texto arbitrário.
- Não colapse múltiplos eixos de classificação em um único campo improvisado.

## Entregáveis

- Contrato de atributo.
- Catálogo de regra governada e classificação.
- Política de agregação por papel do atributo.
