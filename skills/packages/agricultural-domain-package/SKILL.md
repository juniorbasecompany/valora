---
name: agricultural-domain-package
description: Use quando trabalhar com vocabulário, entidade, evento, curva por idade ou estágio, classificação, KPI, validação e semântica de negócio do domínio agrícola sobre o núcleo compartilhado, incluindo curva global com sobrescrita opcional por país e local.
---

# Pacote de domínio agrícola

Use esta skill para a semântica agrícola. Combine-a com uma ou mais skill centrais quando a tarefa afetar estrutura ou cálculo.

Leia estas referências conforme necessário:
- 'references/domain-vocabulary.md'
- 'references/agricultural-entities.md'
- 'references/agricultural-events.md'
- 'references/agricultural-curves.md'
- 'references/agricultural-kpis.md'
- 'references/agricultural-validations.md'

## Fluxo

1. Traduza o termo de negócio em entidade estrutural e metadado configurável.
2. Mantenha a semântica agrícola no pacote, e não no esquema do núcleo.
3. Use curva por idade ou estágio fenológico e catálogo governado de evento.
4. Trate a curva global como padrão e permita sobrescrita por país ou local por meio de fallback.
5. Valide a saída contra a realidade operacional diária esperada.

## Restrições

- Mantenha explícitas a fórmula e a validação do domínio.

## Entregáveis

- Mapeamento de vocabulário do domínio.
- Definição de evento e curva agrícola.
- Diretriz de KPI e validação.
