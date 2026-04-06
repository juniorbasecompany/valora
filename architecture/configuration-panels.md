# Padrão de painéis de configuração

## Escopo

Este documento define o padrão canónico para painéis de configuração e edição na área protegida do sistema.

- Vale para novos painéis de cadastro, configuração e diretório.
- Exceção só deve acontecer com motivo explícito no próprio diff ou em decisão arquitetural nova.

## Estrutura base

- O painel usa `PageHeader` com `eyebrow`, `title`, `description` e um `StatusPanel`.
- O layout principal usa abas `general` e `history`.
- A aba `history` deve permanecer visível mesmo quando ainda for placeholder de layout.
- A aba `general` concentra a edição real.
- Em edição de registro único, a área principal usa editor à esquerda e painel contextual à direita.
- Em edição de diretório, a área principal usa lista à esquerda, editor no centro e painel contextual à direita.
- O rodapé de ações fica fixo no slot do app shell.

Alguns fluxos de configuração usam **outra composição**: diretório à esquerda, editor ao centro e bloco de histórico (placeholder) abaixo da grelha, sem abas `general`/`history`. Esse stack está descrito na secção **Diretório + editor (lista ou árvore)**.

## Diretório + editor (lista ou árvore)

Padrão canónico para telas como escopo e locais: lista plana ou árvore no `aside`, formulário no painel central, `ConfigurationHistoryPlaceholder` e ações no `ConfigurationEditorFooter` via portal do app shell.

### Camadas de código

1. **`ConfigurationDirectoryEditorLayout`** — casca só de markup: `PageHeader`, grelha `ui-layout-directory-editor`, `aside` (slot), painel do editor com `ref` e `data-delete-pending`, histórico, portal do footer. Sem política de “o que mostrar” no editor. A repartição de espaço extra entre aside e editor usa `directoryAsideEditorGrowRatio`: padrão **`2-4`** (classes `ui-layout-directory-editor--grow-2-4`); diretórios hierárquicos por escopo (locais, unidades via `ScopeHierarchyConfigurationClient`) usam **`4-3`** (`--grow-4-3`), alinhado ao CSS em `semantic-utility-extension.css`.
2. **`ConfigurationDirectoryEditorShell`** — compõe o layout e define o contrato do **corpo do editor**:
   - variante predefinida **`alwaysShowForm`**: conteúdo sempre dentro de `div.ui-editor-card-flow` (comportamento atual de escopo e locais);
   - variante opt-in **`emptyWhenNoContext`**: quando não há contexto de edição, substitui o corpo do editor por `ui-panel ui-empty-panel` com mensagem configurável (ex.: registro único tipo tenant); nos diretórios com **Novo** na URL (`…=new`), preferir o padrão **`alwaysShowForm`** e colocar o vazio **dentro** de `ui-editor-card-flow`, para o modo criação não ficar por baixo do placeholder do shell (membros e escopos seguem assim).
3. **`ConfigurationDirectoryCreateButton`** (`configuration-directory-create-button.tsx`) — atalho canônico **Novo** / **Nova** (texto curto por locale e gênero do substantivo) no `aside` do diretório; estilos em `vertical-semantic-component.css` (`ui-configuration-directory-create-*`), mesma linguagem de borda que `ui-directory-item` (não reutilizar tokens visuais da árvore de locais neste botão).
4. **`configuration-directory-editor-policy.ts`** — funções puras partilhadas para alinhar o footer entre painéis deste tipo:
   - `directoryEditorCanSubmitForDirectoryEditor` — em exclusão pendente, `canSubmit` é `true` (a API valida); não usar `can_delete` na UI para desativar o botão de perigo.
   - `directoryEditorSaveDisabled` — expressão única para `saveDisabled` com `hasEditableContext`, `canSubmit`, `isSaving`, `isDirty`.

Novos painéis **diretório + editor** devem preferir **Shell + política**; usar só o **Layout** cru é exceção (motivo explícito no código ou PR).

### Dois padrões de configuração

| Padrão | Exemplo | Notas |
|--------|---------|--------|
| **A — Diretório + editor central** | `scope-configuration-client`, `location-configuration-client`, `member-configuration-client` | `ConfigurationDirectoryEditorShell`, URLs com item selecionado quando aplicável. |
| **B — Registro com abas e preview** | `tenant-configuration-client` | Layout distinto (abas, preview lateral, etc.); **não** obrigatório usar o Shell da coluna A nesta fase. |

## Ações e feedback visual

- `Cancelar` usa estilo secundário em cinza.
- `Salvar` usa estilo primário em azul.
- `Apagar` usa estilo de perigo em vermelho.
- Hover de botão só reforça levemente a cor; não desloca nem anima posição.
- `Apagar` não executa exclusão imediata.
- Ao clicar em `Apagar`, o painel entra em estado de exclusão pendente.
- Em exclusão pendente, o painel recebe tom de vermelho suave.
- A exclusão só acontece ao clicar em `Salvar`.
- O botão de perigo alterna entre `Apagar` e `Desmarcar exclusão`.
- O estado de exclusão pendente não mostra banner textual dedicado; a indicação visual padrão é a tonalidade do painel e o estado da ação de perigo.

## Permissões e estado

- O contrato do backend deve expor capacidades explícitas para a UI.
- Para registro único, usar pelo menos `can_edit` e `can_delete` quando houver exclusão.
- Para diretório, usar pelo menos `can_edit`, `can_edit_access` e `can_delete` por item quando aplicável.
- Mostrar aviso global de leitura quando o utilizador puder consultar, mas não editar o conjunto.
- Mostrar aviso local apenas quando o conjunto for editável, mas o registro selecionado estiver protegido.
- Campos ficam desabilitados durante exclusão pendente.
- O painel calcula `isDirty` considerando alterações de formulário e exclusão pendente.
- Navegação para fora do painel deve confirmar descarte quando houver estado sujo.

## URL e navegação

- O estado relevante do painel deve aparecer na URL.
- A aba atual deve estar refletida em query string quando necessário.
- Em diretórios, o item selecionado deve estar refletido na URL para suportar refresh, link direto e retorno previsível.

## Contrato de API

- Operações de edição e exclusão devem ser reforçadas no backend, não apenas no frontend.
- A resposta deve devolver capacidades já resolvidas para o utilizador atual.
- Em diretórios, `PATCH` e `DELETE` podem devolver o snapshot atualizado do diretório quando isso simplificar sincronização do cliente.
- Operações destrutivas sobre o próprio vínculo do utilizador não devem ser permitidas sem regra explícita.

## i18n

- Texto visível não deve ficar em literals no componente.
- Copy de abas, ações, avisos, erros e placeholders vive em `messages/`.
- Chaves de ação devem permanecer consistentes entre painéis quando tiverem o mesmo significado.

## Implementações de referência

- Diretório + editor: `frontend/src/component/configuration/configuration-directory-editor-shell.tsx`, `configuration-directory-editor-layout.tsx`, `configuration-directory-editor-policy.ts`
- Escopo e locais: `frontend/src/component/configuration/scope-configuration-client.tsx`, `location-configuration-client.tsx`, páginas em `frontend/src/app/[locale]/app/configuration/scope/`, `.../location/`
- Campos por escopo (regras): `frontend/src/component/configuration/field-configuration-client.tsx`, página `frontend/src/app/[locale]/app/configuration/field/` (contexto do escopo ativo, mesmo stack de diretório + editor + histórico; ordem do diretório persistida em `field.sort_order`, reordenável por arrastar, alinhado ao padrão `@dnd-kit` das fórmulas em `action-formula-section.tsx`; o editor também marca se o campo representa idade inicial ou final do lote via `field.is_initial_age` / `field.is_final_age`)
- Unidades alocadas: `frontend/src/component/configuration/unity-configuration-client.tsx`, página `frontend/src/app/[locale]/app/configuration/unity/` (cadastro de local + itens do catálogo; idade deixa de ser mantida na unidade e passa a ser sinalizada nos campos do escopo)
- Ações por escopo (rótulos em `label.action_id`): `frontend/src/component/configuration/action-configuration-client.tsx`, página `frontend/src/app/[locale]/app/configuration/action/` (mesmo padrão que campos; `action.sort_order` e reordenação no diretório)
- `frontend/src/component/configuration/tenant-configuration-client.tsx`
- `frontend/src/component/configuration/member-configuration-client.tsx`
- `frontend/src/app/[locale]/app/configuration/tenant/page.tsx`
- `frontend/src/app/[locale]/app/configuration/member/page.tsx`
