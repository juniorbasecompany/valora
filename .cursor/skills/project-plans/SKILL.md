---
name: project-plans
description: Project implementation plans and phased roadmaps for this repository must be written under .cursor/plans/ as versioned Markdown. Use when the user asks for a plan, roadmap, phased checklist, or to create or update project planning documents.
---

# Planos do projeto (repositório)

## Objetivo

Garantir que **planos de implementação**, **roadmaps** e **listas de etapas** do projeto Valora vivam **dentro do repositório**, versionados no Git, e não dependam apenas da pasta global `%USERPROFILE%\.cursor\plans\` do Cursor.

## Onde criar ou atualizar

- **Pasta canónica:** `.cursor/plans/` na **raiz do monorepo** (ao lado de `backend/`, `frontend/`, `architecture/`, etc.).
- **Formato:** ficheiros **Markdown** (`.md`), com títulos claros e, quando fizer sentido, checkboxes `- [ ]` / `- [x]` para acompanhamento.
- **Nomes:** usar identificadores descritivos em **inglês** ou português conforme o resto do repo (ex.: `plan-fase1-banco-dados.md`).

## Regras

1. **Criar** novos planos em `.cursor/plans/` — não colocar a cópia oficial só em `docs/` na raiz (essa pasta foi substituída por `.cursor/plans/` para planos).
2. **Atualizar** planos existentes no mesmo sítio; se o utilizador referir um plano, preferir editar o ficheiro em `.cursor/plans/` correspondente.
3. **Não** tratar `%USERPROFILE%\.cursor\plans\` como fonte de verdade para este projeto; pode mencionar-se que o utilizador pode ter atalhos lá, mas o **Git** deve refletir `.cursor/plans/`.
4. **Conteúdo textual** nos `.md`: português do Brasil; **identificadores técnicos** (caminhos, nomes de ficheiro, comandos) em inglês quando forem código ou convenção do projeto.

## Quando usar esta skill

- Pedidos de "plano", "fases", "roadmap", "checklist de implementação", "próximos passos" documentados.
- Alinhar ou mover documentação de plano que tenha ficado fora de `.cursor/plans/`.

## Referência

- Plano exemplo: [plan-fase1-banco-dados.md](../../plans/plan-fase1-banco-dados.md) (relativo a este `SKILL.md`: `.cursor/plans/`).
