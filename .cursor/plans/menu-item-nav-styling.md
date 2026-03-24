# Alinhar `ui-menu-item` ao `ui-nav-item` e remover `ui-menu-sign-out`

## Objetivo

1. Fazer `.ui-menu-item` espelhar aparência e hover/ativo de `.ui-nav-item` (CSS).
2. **Eliminar a semântica `.ui-menu-sign-out`**: o item "Sair" fica visualmente igual aos demais itens do menu (sem cor/hover de perigo dedicados).

## Arquivos

- [frontend/src/app/styles/vertical-semantic-component.css](frontend/src/app/styles/vertical-semantic-component.css) — regras de `.ui-menu-item` + **remover** blocos `.ui-menu-sign-out` e `.ui-menu-sign-out:hover`.
- [frontend/src/component/app-shell/account-menu.tsx](frontend/src/component/app-shell/account-menu.tsx) — no botão de sign out, usar apenas `className="ui-menu-item"` (remover `ui-menu-sign-out`).

Não há outras referências a `ui-menu-sign-out` no código-fonte (só artefactos `.next`, ignorar).

## CSS — alinhamento ao nav (resumo)

- Base: `position: relative`, `display: flex`, padding como `.ui-nav-item` (`padding-block: 0.625rem`, `padding-left: 1.25rem`, `padding-right: 1rem`), sem `border-radius` no item, transições alinhadas.
- `::before` igual ao nav; `.ui-menu-item-active` e `.ui-menu-item-active::before` iguais ao estado ativo do nav.
- Hover: `.ui-menu-item:hover:not(:disabled):not(.ui-menu-item-active)` com fundo/cor do nav.
- Manter `:disabled` e `:focus-visible` (ajustar `box-shadow` composto se foco + ativo conflitarem).

## CSS / TSX — remoção de sign-out especial

- Apagar regras `.ui-menu-sign-out` e `.ui-menu-sign-out:hover:not(:disabled)` de `vertical-semantic-component.css`.
- Não é necessário substituir por outra classe; o item "Sair" herda o mesmo comportamento que os outros `.ui-menu-item`.

## Verificação manual

- Menus (tenant, escopo, idioma, conta): hover e estado ativo como na sidebar.
- Item **Sair**: mesmo visual que "Perfil" / "Configurações" (ou equivalentes no painel).
- Teclado e `disabled` durante loading: inalterados em intenção.

## Tarefas

- [x] Atualizar `.ui-menu-item` + `::before` + ativo + hover (espelho do nav).
- [x] Revisar `:focus-visible` vs sombra do estado ativo (`.ui-nav-item-active` não usa `box-shadow`; foco mantém só `var(--shadow-focus-ring)`).
- [x] Remover `.ui-menu-sign-out` do CSS e do `account-menu.tsx`.
- [ ] Verificação visual nos painéis (manual).
