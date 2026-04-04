# Plano: filtros ocultos, switch laranja, «Novo» verde, localStorage por tela

## Requisito de persistência (confirmado pelo utilizador)

- **Objetivo:** lembrar se o painel de filtros está **aberto ou fechado** quando o utilizador volta à mesma tela de configuração.
- **Onde:** `localStorage` no browser (sem backend).
- **Granularidade:** **uma chave por tela** de configuração (não um único boolean global para todas as telas). Abrir filtros em «Campos» não altera o estado guardado de «Ações», etc.
- **Convenção sugerida:** `valora.configuration.directoryFilterVisible.<segment>` com `segment` ∈ `scope` | `tenant` | `member` | `event` | `field` | `action` | `location` | `item`.
- **Escopo da chave:** o segmento identifica a **rota / área** de configuração (ex.: todos os escopos na página de campos partilham o mesmo `field`), não o item selecionado na lista.
- **Default:** se não existir valor para aquela chave, tratar como **oculto** (`false`).
- **Escrita:** cada clique no switch persiste de imediato o boolean na chave da tela atual.
- **Hidratação:** snapshot no servidor sempre oculto; após hidratação, ler a chave da tela atual (ex.: `useSyncExternalStore` ou `useEffect` + estado) para evitar mismatch com Next.js.

## Comportamento de UI

1. Painel de filtros laranja (`DirectoryFilterPanel` / `EventFilterPanel`): visível só quando o estado persistido/indica «aberto» (após ler `localStorage`).
2. Switch na mesma linha do «Novo», alinhado à direita, cor **laranja** alinhada ao painel de filtro.
3. Alternar o switch atualiza o estado **e** grava em `localStorage` na chave **daquela tela**.
4. Botão «Novo» com estilo **verde** coerente com o painel de edição (`ui-panel-editor`).

## Telas e segmentos

| `segment` | Cliente |
|-----------|---------|
| `scope` | `scope-configuration-client` |
| `tenant` | `tenant-configuration-client` |
| `member` | `member-configuration-client` |
| `event` | `event-configuration-client` |
| `field` | `field-configuration-client` |
| `action` | `action-configuration-client` |
| `location` | `location-configuration-client` |
| `item` | `item-configuration-client` |

## Implementação (resumo)

- Contexto no [`configuration-directory-editor-shell.tsx`](frontend/src/component/configuration/configuration-directory-editor-shell.tsx): receber `filterPanel` + identificador de segmento (ou `storageKey` explícita).
- Componente de switch + linha de toolbar no aside; i18n para `aria-label` do switch.
- CSS em [`vertical-semantic-component.css`](frontend/src/app/styles/vertical-semantic-component.css).

## Tarefas

- [ ] Provider + sincronização com `localStorage` por `segment` / chave
- [ ] API do shell (`filterPanel`, chave de armazenamento) e `topContent` condicional
- [ ] Switch + toolbar; ajuste do `ConfigurationDirectoryCreateButton` se necessário
- [ ] CSS laranja (switch) e verde (Novo)
- [ ] Oito clientes de configuração + strings i18n
