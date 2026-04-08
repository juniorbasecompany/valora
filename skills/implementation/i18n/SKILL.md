---
name: i18n
description: User-visible strings, API errors shown in the UI, server-rendered email/PDF copy, and PR review for new literals. Use with Next.js frontend, FastAPI backend, and multi-country domain rules. Always follow skills/implementation/i18n/policy.md and the stack skill.
---

# Internacionalização (implementação)

## Objetivo

Garantir que **texto de produto e mensagens de erro** não fiquem espalhados como literals sem governo, alinhado à [política de i18n](./policy.md) e à [stack](../stack/SKILL.md).

## Quando usar

- Alterar ou adicionar texto **visível** no `frontend/` (rótulos, botões, empty states, erros de formulário).
- Definir ou consumir **respostas de erro** da API que o utilizador vê no browser.
- Implementar **e-mail, PDF ou notificação** gerados no `backend/` com copy humana.
- Rever diff que introduza **strings novas** de produto.

## Regras obrigatórias

- Usar **chaves estáveis em inglês** com **namespaces** (`common`, `auth`, `error`, `domain.*`); uma chave, um significado.
- **Não** usar frase de UI ou de produto em português (ou outro idioma) como **única** fonte de verdade em JSX ou em Python; mensagens vivem em ficheiros de tradução ou camada equivalente.
- Sempre que **adicionar, alterar ou remover** texto governado por i18n, aplicar a mesma mudança a **todos os idiomas suportados** no mesmo ciclo de trabalho. As traduções devem permanecer sincronizadas em **chaves, hierarquia, placeholders/interpolações, estados de UI e conteúdo equivalente**, sem idiomas “atrasados” ou com estrutura divergente. No `frontend/`, antes de merge, `npm run check:i18n` deve passar (ver [policy.md](./policy.md)).
- **API:** expor **`code` estável** e detalhes estruturados; no cliente, mapear `code` → chave i18n (com interpolação a partir dos detalhes). Evitar depender só de `message` livre para a UI.
- **Formatação:** datas, números e moeda de exibição com **`Intl`** (ou API do next-intl), segundo o locale efectivo; não formatar “na mão” por cópia de símbolos.
- **Pontuação em copy:** seguir [policy.md](./policy.md): não usar `—` (travessão longo) em mensagens; preferir vírgula ou nova oração.
- **Idioma da UI** e **contexto operacional multi-país** (tenant, regra fiscal, moeda funcional) são conceitos distintos; regra de negócio e sobrescrita por país seguem [multi-country-localization](../../application/multi-country-localization/SKILL.md), não ramificações só para trocar texto.

## Stack

- **Frontend:** **next-intl**, mensagens em `messages/` (ou estrutura documentada no projeto), segmento **`[locale]`** no App Router quando aplicável. Alternativa **react-i18next** só se [policy.md](./policy.md) e esta skill forem actualizados explicitamente.
- **Backend:** códigos de erro estáveis; ficheiros ou templates de tradução **só** onde o servidor envia texto final ao utilizador (e-mail, PDF, etc.).

## Metadado (rótulos em base de dados)

- Para tradução assistida de `label` ligada a **`field`** (preenchimento automático entre `pt-BR`, `en`, `es` ao criar ou atualizar o campo com `label_lang`/`label_name`; a DeepL recebe `source_lang` derivado desse idioma e `target_lang` por destino, ver [policy.md](./policy.md)), seguir a secção **Tradução assistida para metadado em base de dados** (provedor: **DeepL API**; `action` ainda não entra neste fluxo).

## Referências

- Política estável: [policy.md](./policy.md) (inclui DeepL para rótulos em BD)
- Stack canónica: [skills/implementation/stack/SKILL.md](../stack/SKILL.md)
- Multi-país (domínio): [skills/application/multi-country-localization/SKILL.md](../../application/multi-country-localization/SKILL.md)
- Arquitectura: [architecture/technology-stack.md](../../../architecture/technology-stack.md)
