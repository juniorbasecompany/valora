---
name: multi-country-localization
description: Use quando desenhar ou revisar comportamento multi-país: contexto operacional, rótulo, mensagem multilíngue, formatação por localidade e sobrescrita por país na exibição.
---

# Localização para múltiplos países

Use esta skill quando o sistema precisar se comportar corretamente em mais de um país, sem transformar regra específica de país em rigidez do núcleo.

Leia estas referências conforme necessário:
- `references/country-in-scope.md`
- `references/locale-and-timezone.md`
- `references/currency-behavior.md`
- `references/reporting-conversion.md`

## Fluxo

1. Decida se o país é obrigatório no fluxo específico ou apenas opcional na hierarquia.
2. Diferencie padrão de interface, preferência do usuário e contexto operacional persistido.
3. Resolva rótulo traduzido, mensagem de UX e valor formatado na exibição.
4. Aplique fallback textual governado sem ramificação fixa por país.
5. Trate relatório em múltipla moeda como visão derivada de consulta.

## Restrições

- Não exija país em todo caminho não econômico se a operação não precisar disso.
- Não transforme comportamento semanal em regra operacional específica de país.
- Mantenha sobrescrita específica de país dentro de fallback e metadado, e não em ramificação fixa de código.
- Não misture rótulo de domínio com mensagem geral de UX sem chave técnica e origem governada.
- Não deixe preferência textual do usuário alterar terminologia operacional persistida.

## Entregáveis

- Regra de escopo com consciência de país.
- Comportamento de localidade, idioma e fuso horário.
- Regra de fallback de texto multilíngue.
- Limite entre contexto operacional persistido e exibição localizada.
- Contrato de conversão no momento da consulta para relatório.
