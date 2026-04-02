# Plano: padrão único de flash, scroll e foco nos painéis do editor

## Objetivo

Documentar o **padrão canónico** recomendado e alinhar os sete clientes de configuração que usam `useEditorPanelFlash` e `useFocusFirstEditorFieldAfterFlash`, para que comportamento e UI sigam a mesma convenção, facilitando manutenção e novos ecrãs.

## Padrão recomendado (fonte de verdade)

### Camada de comportamento (obrigatória)

- **`useEditorPanelFlash(editorPanelElementRef, editorFlashKey)`** — scroll condicional no `ui-editor-panel`, flash de 960 ms, debounce de 24 ms.
- **`useFocusFirstEditorFieldAfterFlash(editorPanelElementRef, isEditorFlashActive, enabled)`** — foco no início do flash, priorizando `[data-editor-primary-field='true']`.
- **`editorFlashKey`**: string estável por **identidade do registo em edição** — preferir `id` e campos de rótulo que definem “qual item é”; **evitar** valores que mudam só por refresh do servidor ou por edição dentro do mesmo contexto (ex.: data/hora já persistida), salvo requisito de produto explícito.
- **Clique em «Novo» (create)**: sempre que o utilizador activar o botão **Novo** / entrada em modo criar, deve correr de novo o **mesmo pipeline** (scroll condicional, flash, foco no primeiro campo), **mesmo que** o contexto já fosse «novo registo» e a identidade lógica do registo **não** mudasse. Ou seja: repetir o efeito é uma **acção explícita do utilizador**, não só uma mudança de chave na URL ou no estado derivado.  
  - **Hoje:** [`useEditorPanelFlash`](../../frontend/src/component/configuration/use-editor-panel-flash.ts) só chama `triggerFlash()` quando `flashKey` **altera** em relação a `previousKeyRef`; se `flashKey` continua `"new"` (ou equivalente), um segundo clique em «Novo» **não** dispara o efeito.  
  - **Alvo:** incorporar na chave (ou num segundo parâmetro ao hook) um **token de repetição** incrementado em cada clique em «Novo» (ex.: `new:${createAttemptId}` / contador `useRef` + `setState`), ou estender o hook com um `retriggerDependency` opcional; o importante é que o **efeito perceptível** volte a ocorrer sempre que o utilizador pedir «Novo» de novo.

### Camada de UI

1. **Formulários que começam por nome + nome de exibição**  
   Usar **`ConfigurationNameDisplayNameFields`** com **`flashActive={isEditorFlashActive}`** (overlay só no primeiro cartão desse componente; campo nome com `data-editor-primary-field` já definido no componente).

2. **Formulários com outro primeiro controlo**  
   - Um **`EditorPanelFlashOverlay`** como primeiro filho relevante do **primeiro** `section` do fluxo do editor (`.ui-editor-card-flow`).  
   - Marcar o alvo de foco com **`data-editor-primary-field="true"`** (ou prop `primaryField` em componentes que já propagam o atributo, ex. `HierarchySingleSelectField`).

3. **Excepções documentadas**  
   Apenas quando o fluxo de UX for intencionalmente diferente (deve ser raro e com comentário no código).

## Estado actual vs alvo

| Cliente | Situação | Alvo |
|--------|----------|------|
| [`scope-configuration-client.tsx`](../../frontend/src/component/configuration/scope-configuration-client.tsx) | Já: `ConfigurationNameDisplayNameFields` + `flashActive`; `enabled === true` | Manter UI; opcional alinhar `enabled` à convenção dos restantes se existir estado `directory` análogo no futuro, ou manter `true` com nota de “diretório sempre presente”. |
| [`scope-hierarchy-configuration-client.tsx`](../../frontend/src/component/configuration/scope-hierarchy-configuration-client.tsx) | `editorFlashKey` em create: `new:${parentId}` | **Alinhar** a `"new"` como nos outros, **a menos** que se confirme requisito de voltar a flashar ao mudar só o pai em modo criar; se o requisito existir, documentar comentário no `useMemo` da chave. |
| [`tenant-configuration-client.tsx`](../../frontend/src/component/configuration/tenant-configuration-client.tsx) | `ConfigurationNameDisplayNameFields` + `flashActive`; `enabled` por contexto | Já conforme o padrão “nome/display”; nenhuma mudança obrigatória. |
| [`member-configuration-client.tsx`](../../frontend/src/component/configuration/member-configuration-client.tsx) | Dois `EditorPanelFlashOverlay` nos cartões de email; `flashActive` condicional estranho em `ConfigurationNameDisplayNameFields` | **Alinhar**: um único overlay no **primeiro** `section` visível (convite vs edição), **sem** flash duplicado no bloco nome/display (`flashActive={false}` ou omitir); **`data-editor-primary-field="true"`** no input de email visível (convite e edição) para o foco bater certo com o primeiro campo; remover lógica de `flashActive` que depende de `selectedMember == null` no nome/display. |
| [`action-configuration-client.tsx`](../../frontend/src/component/configuration/action-configuration-client.tsx) | Overlay no primeiro section; input sem `data-editor-primary-field` | Adicionar **`data-editor-primary-field="true"`** no primeiro input (nome da ação). |
| [`field-configuration-client.tsx`](../../frontend/src/component/configuration/field-configuration-client.tsx) | Idem | Adicionar **`data-editor-primary-field="true"`** no primeiro input (nome do campo). |
| [`event-configuration-client.tsx`](../../frontend/src/component/configuration/event-configuration-client.tsx) | `editorFlashKey` inclui `moment_utc`; overlay + `primaryField` no local | **Remover `moment_utc` da chave** (usar `id` e eventualmente campos estáveis de identificação); manter `primaryField` no primeiro hierárquico. |

## Passos de implementação sugeridos

0. **Hook + clique «Novo»** — Decidir implementação única (preferível no próprio [`use-editor-panel-flash.ts`](../../frontend/src/component/configuration/use-editor-panel-flash.ts) ou em estado partilhado nos clientes):
   - Incrementar um **nonce** ou `createSessionId` no handler do botão «Novo» / `handleStartCreate` (e equivalentes), e incluí-lo na `editorFlashKey` em modo criar, **ou**
   - Adicionar ao hook um parâmetro opcional (ex.: `newIntentGeneration: number`) que só muda nesse clique, para forçar `triggerFlash()` sem poluir a identidade do registo na URL.
   - Aplicar em **todos** os clientes com `ConfigurationDirectoryCreateButton` ou fluxo equivalente de «Novo», incluindo tenant se o botão «Novo» existir no mesmo padrão.
   - Validar: já em `…=new` ou modo criar, clicar de novo em «Novo» → scroll/flash/foco repetem-se.

1. **Evento** — Ajustar `editorFlashKey` em [`event-configuration-client.tsx`](../../frontend/src/component/configuration/event-configuration-client.tsx) para não depender de `selectedEvent.moment_utc` (ex.: `id` + identificador estável se necessário para distinguir duplicados na lista). Validar que trocar de evento na lista ainda altera a chave; que editar só o datetime no formulário **não** dispara novo flash ao guardar/receber dados.

2. **Hierarquia** — Em [`scope-hierarchy-configuration-client.tsx`](../../frontend/src/component/configuration/scope-hierarchy-configuration-client.tsx), alinhar chave de create com o padrão global (ex.: `"new"` + nonce de tentativa, ou `new:${parentId}:${nonce}` se o pai ainda fizer parte da identidade). O nonce de «Novo» cobre o requisito de repetir o efeito ao clicar de novo em «Novo».

3. **Ação e campo** — Nos primeiros `input` de nome, adicionar `data-editor-primary-field="true"` em [`action-configuration-client.tsx`](../../frontend/src/component/configuration/action-configuration-client.tsx) e [`field-configuration-client.tsx`](../../frontend/src/component/configuration/field-configuration-client.tsx).

4. **Membro** — Refactor leve em [`member-configuration-client.tsx`](../../frontend/src/component/configuration/member-configuration-client.tsx):
   - Garantir **um** overlay por estado (criar vs editar): um único padrão visual (primeiro section), inputs de email com `data-editor-primary-field="true"`.
   - Em `ConfigurationNameDisplayNameFields`, passar **`flashActive={false}`** (ou não passar `flashActive`) para não sobrepor o padrão “um anel no topo do formulário”.
   - Remover condição `isEditorFlashActive && !isCreateMode && selectedMember == null` em `flashActive`.
   - Confirmar `useFocusFirstEditorFieldAfterFlash` `enabled` alinhado (já restringe a contexto com membro ou criar).

5. **Escopo** — Revisão cosmética apenas: se `enabled: true` for mantido, um comentário curto em português (Brasil) a explicar que o diretório é sempre resolvido neste cliente.

6. **Validação manual** — Para cada ecrã: trocar item na lista, confirmar scroll suave (se necessário), flash único, foco no campo primário esperado; modo criar e edge cases (lista vazia, loading) conforme aplicável.

7. **Documentação estável (opcional, fora deste plano volátil)** — Se a equipa quiser política permanente, extrair um parágrafo para `skills/` ou `architecture/`; este ficheiro em `.cursor/plans/` permanece checklist de entrega.

## Ficheiros a tocar (resumo)

- [`frontend/src/component/configuration/event-configuration-client.tsx`](../../frontend/src/component/configuration/event-configuration-client.tsx)
- [`frontend/src/component/configuration/scope-hierarchy-configuration-client.tsx`](../../frontend/src/component/configuration/scope-hierarchy-configuration-client.tsx)
- [`frontend/src/component/configuration/action-configuration-client.tsx`](../../frontend/src/component/configuration/action-configuration-client.tsx)
- [`frontend/src/component/configuration/field-configuration-client.tsx`](../../frontend/src/component/configuration/field-configuration-client.tsx)
- [`frontend/src/component/configuration/member-configuration-client.tsx`](../../frontend/src/component/configuration/member-configuration-client.tsx)
- Opcional: [`frontend/src/component/configuration/scope-configuration-client.tsx`](../../frontend/src/component/configuration/scope-configuration-client.tsx) (comentário em `useFocusFirstEditorFieldAfterFlash`)

## Critérios de aceitação

- Cada clique em «Novo» dispara novamente scroll (se aplicável), flash e foco, mesmo permanecendo em modo criar com a mesma query/registo lógico «novo».
- Todos os clientes listados seguem a tabela “Alvo” acima.
- Não há regressão visível nos overlays (um destaque coerente por troca de contexto).
- Foco após flash coincide com o campo primário documentado (`data-editor-primary-field` ou equivalente).
- `editorFlashKey` não refaz flash por mudanças de dados “internas” ao mesmo registo, salvo decisão explícita para hierarquia (pai em modo criar).

## Checklist

- [ ] Comportamento: segundo clique em «Novo» com o mesmo contexto ainda dispara scroll + flash + foco
- [ ] Evento: chave sem `moment_utc`
- [ ] Hierarquia: chave `"new"` ou comentário de produto
- [ ] Ação: `data-editor-primary-field` no primeiro input
- [ ] Campo: `data-editor-primary-field` no primeiro input
- [ ] Membro: overlay único no primeiro section; email com primary; nome/display sem flash duplicado
- [ ] Escopo: comentário opcional em `enabled`
- [ ] Testes manuais nos sete fluxos
