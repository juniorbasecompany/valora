---
name: Fallbacks nome e ID (revisão)
overview: "Remover apresentação de ID apenas onde for estritamente redundante (nome obrigatório e já visível). Manter identificador (ex. #id) sempre que a informação amigável estiver ausente ou incompleta, sem substituir por hífen ou mensagens genéricas opacas."
todos:
  - id: inventory
    content: "Inventariar cada uso de #id/título com ID e classificar redundante vs necessário"
    status: completed
  - id: remove-redundant-only
    content: "Remover só UI redundante (legenda duplicada, etc.); não tocar fallbacks de dado ausente"
    status: completed
  - id: verify-missing-info
    content: "Confirmar que listas/erros com label ausente continuam com identificador legível (#id ou padrão actual)"
    status: completed
  - id: i18n-build
    content: "Ajustar só chaves i18n afectadas; check:i18n e build"
    status: completed
isProject: true
---

# Plano revisado: ID visível só removido quando removível

## Princípio

- **Remover ID** (ou legenda técnica duplicada) **apenas** quando, no fluxo normal, **já existe informação suficiente e não ausente** para identificar a entidade ao utilizador (ex.: nome do scope na lista quando a API exige nome não vazio).
- **Não remover** nem substituir por “`-`”, “sem nome” ou mensagem genérica **quando a informação deveria existir mas não existe** ou está incompleta: nesses casos deve continuar algo **identificável** (manter o padrão actual tipo `#${id}`, `list.fallbackTitle` com id, ou equivalente que permita distinguir registos).

Ou seja: a simplificação **não** passa por apagar o identificador nos casos de **dado ausente**; passa por **eliminar ruído** onde o ID **não acrescenta** informação.

## O que conta como “pode ser removido” (seguro)

| Situação | Motivo |
|----------|--------|
| Legenda ou segunda linha com **só** `#id` **abaixo** do nome já exibido na mesma célula, e o nome vem de entidade com **nome obrigatório** na API | O ID é **redundante** para o utilizador final. |
| Duplicação visual do mesmo identificador em mais do que um sítio no mesmo cartão/lista | Remover a cópia extra, não a única referência quando não há nome. |

Exemplo alinhado com o código actual: em [`scope-configuration-client.tsx`](frontend/src/component/configuration/scope-configuration-client.tsx), o **título** já mostra `resolveScopeLabel` (`name.trim() || "-"`). A linha **`#${item.id}`** em `ui-directory-caption-wrap` é candidata a **remoção** (redundante se o nome nunca for vazio no contrato da API).

## O que **não** alterar neste âmbito (manter identificável)

- **Ações** sem `label_name`: manter estratégia **identificável** (ex. [`list.fallbackTitle` com `{id}`](frontend/messages/en-US.json) em [`action-configuration-client.tsx`](frontend/src/component/configuration/action-configuration-client.tsx)), **não** trocar por texto genérico sem distinção entre ítens.
- **Hierarquias, kind, unity, eventos, cálculo idade atual, editor de fórmulas**: onde o código usa `#id` ou ID em mensagens de erro porque **falta** label no mapa ou referência quebrada — **manter** identificador ou equivalente que permita saber **qual** registo é; não substituir por placeholder opaco.
- **Membro** sem nome: a regra de produto é **mostrar o e-mail** (identificável e já usado em [`member-configuration-client.tsx`](frontend/src/component/configuration/member-configuration-client.tsx) como fallback); não substituir por ID nem por mensagem genérica se o e-mail existir.
- **Histórico / auditoria**: **pode mostrar normalmente os IDs** dos registos (ex. `formatHistoryLogIdDisplay`, `entryLabel` com id); **não** entra no âmbito de “remover ruído” deste plano salvo duplicação óbvia no mesmo bloco de UI.

## Passos de trabalho

1. **Inventário**: percorrer ocorrências de `` `#${` ``, `fallbackTitle`, e fallbacks em [`current-age-calculation-client.tsx`](frontend/src/component/calculation/current-age-calculation-client.tsx) / [`event-configuration-client.tsx`](frontend/src/component/configuration/event-configuration-client.tsx); marcar cada uma como **redundante** ou **necessária para identificação**. **Histórico**: assumir IDs **visíveis como desejados**; só incluir no inventário se existir duplicação puramente redundante no mesmo cartão.
2. **Edição mínima**: aplicar remoções **só** na lista “redundante”; não alterar ramos “dado ausente”.
3. **Verificação**: `npm run check:i18n` se tocar em mensagens; `npm run build` / smoke nas páginas de configuração e cálculo; confirmar que listas com label em falta ainda mostram **algo distinguível** (ID ou cópia que inclua ID).

## Esclarecimento de produto

- “Identificável” = **não** mensagem genérica única para todos os casos; pode continuar a ser **`#123`**, “Ação #123”, ou label + id quando o nome falta (excepto **membro** sem nome → **e-mail**).
- **Auditoria**: IDs **ok** por defeito no painel de histórico.
