# Escopo: feedback igual ao location (sem sucesso)

## Objetivo

Deixar o painel de escopo alinhado ao de **location** no que diz respeito a feedback: **apenas erros** na área central do rodapé (`ConfigurationEditorFooter` / `footerErrorMessage`). **Não** manter estado nem UI de mensagem de sucesso.

## O que fazer

### [`scope-configuration-client.tsx`](frontend/src/component/configuration/scope-configuration-client.tsx)

1. Remover `useState` de `successMessage` e todas as chamadas a `setSuccessMessage`.
2. Ajustar `syncFromDirectory`: remover o parâmetro `nextSuccessMessage` (e o argumento nas chamadas que passavam `copy.savedNotice`, `copy.createdNotice`, `copy.deletedNotice`). O corpo da função deixa de chamar `setSuccessMessage`.
3. Remover o bloco JSX que renderiza `ui-status-panel ui-tone-positive` dentro de `ui-editor-panel-body`.
4. Em `ConfigurationNameDisplayNameFields`, remover `onAfterFieldEdit={() => setSuccessMessage(null)}` (pode omitir a prop `onAfterFieldEdit` se só servia para isso).
5. Em `handleSave` e `handleToggleDelete`, remover linhas que só existiam para limpar sucesso (`setSuccessMessage(null)`).

### [`configuration-editor-footer.tsx`](frontend/src/component/configuration/configuration-editor-footer.tsx)

- **Nenhuma alteração** (location já não tem sucesso no footer; escopo fica igual).

## Resultado

- Comportamento equivalente ao location: feedback textual visível só para **erro de request**, **erro de validação** (agregados em `footerErrorMessage`) e estados de campo.
- Operações bem-sucedidas não exibem banner verde; o utilizador vê o estado atualizado na lista e nos campos.

## Verificação

- Salvar / criar / apagar escopo: sem banner de sucesso; dados atualizados.
- Erro de API ou validação: mensagem continua no footer como hoje.
