# valora

Repositório de documentação canônica para a construção gradual de um sistema que substitui planilhas operacionais por uma solução robusta, auditável e evolutiva.

## Mapa do repositório

- `.cursor/rules/`: convenções persistentes do agente e de escrita aplicadas em toda sessão do projeto.
- `backend/`: projeto Python do núcleo executável, com dependência isolada do restante do repositório. O ERD em formato drawDB (fonte de verdade do diagrama relacional) está em [`backend/erd.json`](backend/erd.json); detalhes de schema e API em [`backend/README.md`](backend/README.md).
- `frontend/`: projeto web separado, com dependência própria e sem mistura com o backend.
- `skills/`: verdade operacional. Define como cada parte do sistema deve ser implementada. O subconjunto [`skills/implementation/stack/`](skills/implementation/stack/SKILL.md) fixa o stack de front e back na implementação e revisão.
- `architecture/`: verdade decisória curta. Registra princípios, limites e decisões permanentes. O ficheiro [`technology-stack.md`](architecture/technology-stack.md) regista a decisão canónica de stack (frontend e backend).
- `vision/`: explicação humana. Mostra o que a solução faz e como ela evolui.
- `reference/`: material de consulta. Reúne apoio, plano anterior, nota conceitual e planilha-fonte.
- `archive/`: histórico superado. Guarda material que não deve mais orientar o desenho atual.
- `.cursor/plans/`: planos de implementação, roadmaps e checklists versionados no Git (ex.: [plano fase 1 — banco de dados](.cursor/plans/plan-fase1-banco-dados.md)). A skill `project-plans` em `.cursor/skills/project-plans/` orienta o agente a criar planos nesta pasta.

## Ordem de autoridade

1. `skills/`
2. `architecture/`
3. `vision/`
4. `reference/`
5. `archive/`

Quando houver conflito entre documentos, a camada de maior autoridade prevalece.

## Convenções persistentes do agente

- `.cursor/rules/` define convenções sempre ativas de idioma, escrita e nomenclatura.
- `skills/` orienta desenho e implementação.
- `architecture/` concentra princípios e decisões permanentes do sistema.

## Ordem sugerida de leitura

1. Comece por `.cursor/rules/` para entender as convenções persistentes de escrita e nomenclatura seguidas pelo agente.
2. Leia `vision/solution-overview.md` para entender o problema e a proposta da solução.
3. Leia `architecture/source-of-truth.md`, `architecture/system-principles.md` e `architecture/technology-stack.md` para entender as decisões permanentes e o stack.
4. Use `skills/` para orientar desenho e implementação.
5. Consulte `reference/` apenas quando precisar de contexto, origem ou exemplo de raciocínio anterior.
