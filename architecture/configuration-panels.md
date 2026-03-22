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

## Ações e feedback visual

- `Cancelar` usa estilo secundário em cinza.
- `Salvar` usa estilo primário em azul.
- `Apagar` usa estilo de perigo em vermelho.
- Hover de botão só reforça levemente a cor; não desloca nem anima posição.
- `Apagar` não executa exclusão imediata.
- Ao clicar em `Apagar`, o painel entra em estado de exclusão pendente.
- Em exclusão pendente, o painel recebe tom de vermelho suave e mostra aviso explícito.
- A exclusão só acontece ao clicar em `Salvar`.
- O botão de perigo alterna entre `Apagar` e `Desmarcar exclusão`.

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

- `frontend/src/component/configuration/tenant-configuration-client.tsx`
- `frontend/src/component/configuration/member-configuration-client.tsx`
- `frontend/src/app/[locale]/app/configuration/tenant/page.tsx`
- `frontend/src/app/[locale]/app/configuration/member/page.tsx`
